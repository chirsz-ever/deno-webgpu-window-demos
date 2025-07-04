// https://github.com/mrdoob/three.js/blob/r175/examples/webgpu_backdrop_water.html

import * as THREE from 'three';
import { color, vec2, pass, linearDepth, normalWorld, triplanarTexture, texture, objectPosition, screenUV, viewportLinearDepth, viewportDepthTexture, viewportSharedTexture, mx_worley_noise_float, positionWorld, time } from 'three/tsl';
import { gaussianBlur } from 'three/addons/tsl/display/GaussianBlurNode.js';

import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';

import { OrbitControls } from 'three/addons/controls/OrbitControls.js';

import { GUI } from 'three/addons/libs/lil-gui.module.min.js';

import Stats from 'three/addons/libs/stats.module.js';

/* POLYFILL */
import * as polyfill from "../polyfill/polyfill.ts";
await polyfill.init("three.js - WebGPU - Backdrop Water");

let camera, scene, renderer;
let mixer, objects, clock;
let model, floor, floorPosition;
let postProcessing;
let controls;
let stats;

init();

function init() {

	camera = new THREE.PerspectiveCamera( 50, window.innerWidth / window.innerHeight, 0.25, 30 );
	camera.position.set( 3, 2, 4 );

	scene = new THREE.Scene();
	scene.fog = new THREE.Fog( 0x0487e2, 7, 25 );
	scene.backgroundNode = normalWorld.y.mix( color( 0x0487e2 ), color( 0x0066ff ) );
	camera.lookAt( 0, 1, 0 );

	const sunLight = new THREE.DirectionalLight( 0xFFE499, 5 );
	sunLight.castShadow = true;
	sunLight.shadow.camera.near = .1;
	sunLight.shadow.camera.far = 5;
	sunLight.shadow.camera.right = 2;
	sunLight.shadow.camera.left = - 2;
	sunLight.shadow.camera.top = 1;
	sunLight.shadow.camera.bottom = - 2;
	sunLight.shadow.mapSize.width = 2048;
	sunLight.shadow.mapSize.height = 2048;
	sunLight.shadow.bias = - 0.001;
	sunLight.position.set( .5, 3, .5 );

	const waterAmbientLight = new THREE.HemisphereLight( 0x333366, 0x74ccf4, 5 );
	const skyAmbientLight = new THREE.HemisphereLight( 0x74ccf4, 0, 1 );

	scene.add( sunLight );
	scene.add( skyAmbientLight );
	scene.add( waterAmbientLight );

	clock = new THREE.Clock();

	// animated model

	const loader = new GLTFLoader();
	loader.load( 'models/gltf/Michelle.glb', function ( gltf ) {

		model = gltf.scene;
		model.children[ 0 ].children[ 0 ].castShadow = true;

		mixer = new THREE.AnimationMixer( model );

		const action = mixer.clipAction( gltf.animations[ 0 ] );
		action.play();

		scene.add( model );

	} );

	// objects

	const textureLoader = new THREE.TextureLoader();
	const iceDiffuse = textureLoader.load( './textures/water.jpg' );
	iceDiffuse.wrapS = THREE.RepeatWrapping;
	iceDiffuse.wrapT = THREE.RepeatWrapping;
	iceDiffuse.colorSpace = THREE.NoColorSpace;

	const iceColorNode = triplanarTexture( texture( iceDiffuse ) ).add( color( 0x0066ff ) ).mul( .8 );

	const geometry = new THREE.IcosahedronGeometry( 1, 3 );
	const material = new THREE.MeshStandardNodeMaterial( { colorNode: iceColorNode } );

	const count = 100;
	const scale = 3.5;
	const column = 10;

	objects = new THREE.Group();

	for ( let i = 0; i < count; i ++ ) {

		const x = i % column;
		const y = i / column;

		const mesh = new THREE.Mesh( geometry, material );
		mesh.position.set( x * scale, 0, y * scale );
		mesh.rotation.set( Math.random(), Math.random(), Math.random() );
		objects.add( mesh );

	}

	objects.position.set(
		( ( column - 1 ) * scale ) * - .5,
		- 1,
		( ( count / column ) * scale ) * - .5
	);

	scene.add( objects );

	// water

	const timer = time.mul( .8 );
	const floorUV = positionWorld.xzy;

	const waterLayer0 = mx_worley_noise_float( floorUV.mul( 4 ).add( timer ) );
	const waterLayer1 = mx_worley_noise_float( floorUV.mul( 2 ).add( timer ) );

	const waterIntensity = waterLayer0.mul( waterLayer1 );
	const waterColor = waterIntensity.mul( 1.4 ).mix( color( 0x0487e2 ), color( 0x74ccf4 ) );

	// linearDepth() returns the linear depth of the mesh
	const depth = linearDepth();
	const depthWater = viewportLinearDepth.sub( depth );
	const depthEffect = depthWater.remapClamp( - .002, .04 );

	const refractionUV = screenUV.add( vec2( 0, waterIntensity.mul( .1 ) ) );

	// linearDepth( viewportDepthTexture( uv ) ) return the linear depth of the scene
	const depthTestForRefraction = linearDepth( viewportDepthTexture( refractionUV ) ).sub( depth );

	const depthRefraction = depthTestForRefraction.remapClamp( 0, .1 );

	const finalUV = depthTestForRefraction.lessThan( 0 ).select( screenUV, refractionUV );

	const viewportTexture = viewportSharedTexture( finalUV );

	const waterMaterial = new THREE.MeshBasicNodeMaterial();
	waterMaterial.colorNode = waterColor;
	waterMaterial.backdropNode = depthEffect.mix( viewportSharedTexture(), viewportTexture.mul( depthRefraction.mix( 1, waterColor ) ) );
	waterMaterial.backdropAlphaNode = depthRefraction.oneMinus();
	waterMaterial.transparent = true;

	const water = new THREE.Mesh( new THREE.BoxGeometry( 50, .001, 50 ), waterMaterial );
	water.position.set( 0, 0, 0 );
	scene.add( water );

	// floor

	floor = new THREE.Mesh( new THREE.CylinderGeometry( 1.1, 1.1, 10 ), new THREE.MeshStandardNodeMaterial( { colorNode: iceColorNode } ) );
	floor.position.set( 0, - 5, 0 );
	scene.add( floor );

	// caustics

	const waterPosY = positionWorld.y.sub( water.position.y );

	let transition = waterPosY.add( .1 ).saturate().oneMinus();
	transition = waterPosY.lessThan( 0 ).select( transition, normalWorld.y.mix( transition, 0 ) ).toVar();

	const colorNode = transition.mix( material.colorNode, material.colorNode.add( waterLayer0 ) );

	//material.colorNode = colorNode;
	floor.material.colorNode = colorNode;

	// renderer

	renderer = new THREE.WebGPURenderer();
	renderer.setPixelRatio( window.devicePixelRatio );
	renderer.setSize( window.innerWidth, window.innerHeight );
	renderer.setAnimationLoop( animate );
	document.body.appendChild( renderer.domElement );

	stats = new Stats();
	document.body.appendChild( stats.dom );

	controls = new OrbitControls( camera, renderer.domElement );
	controls.minDistance = 1;
	controls.maxDistance = 10;
	controls.maxPolarAngle = Math.PI * 0.9;
	controls.autoRotate = true;
	controls.autoRotateSpeed = 1;
	controls.target.set( 0, .2, 0 );
	controls.update();

	// gui

	const gui = new GUI();

	floorPosition = new THREE.Vector3( 0, .2, 0 );

	gui.add( floorPosition, 'y', - 1, 1, .001 ).name( 'position' );

	// post processing

	const scenePass = pass( scene, camera );
	const scenePassColor = scenePass.getTextureNode();
	const scenePassDepth = scenePass.getLinearDepthNode().remapClamp( .3, .5 );

	const waterMask = objectPosition( camera ).y.greaterThan( screenUV.y.sub( .5 ).mul( camera.near ) );

	const scenePassColorBlurred = gaussianBlur( scenePassColor );
	scenePassColorBlurred.directionNode = waterMask.select( scenePassDepth, scenePass.getLinearDepthNode().mul( 5 ) );

	const vignette = screenUV.distance( .5 ).mul( 1.35 ).clamp().oneMinus();

	postProcessing = new THREE.PostProcessing( renderer );
	postProcessing.outputNode = waterMask.select( scenePassColorBlurred, scenePassColorBlurred.mul( color( 0x74ccf4 ) ).mul( vignette ) );

	//

	window.addEventListener( 'resize', onWindowResize );

}

function onWindowResize() {

	camera.aspect = window.innerWidth / window.innerHeight;
	camera.updateProjectionMatrix();

	renderer.setSize( window.innerWidth, window.innerHeight );

}

function animate() {

	stats.update();

	controls.update();

	const delta = clock.getDelta();

	floor.position.y = floorPosition.y - 5;

	if ( model ) {

		mixer.update( delta );

		model.position.y = floorPosition.y;

	}

	for ( const object of objects.children ) {

		object.position.y = Math.sin( clock.elapsedTime + object.id ) * .3;
		object.rotation.y += delta * .3;

	}

	postProcessing.render();

}
