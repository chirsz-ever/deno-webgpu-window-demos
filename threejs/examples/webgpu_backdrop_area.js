// https://github.com/mrdoob/three.js/blob/r175/examples/webgpu_backdrop_area.html

import * as THREE from 'three';
import { color, positionWorld, linearDepth, viewportLinearDepth, viewportSharedTexture, screenUV, hue, time, checker, uv, modelScale } from 'three/tsl';
import { hashBlur } from 'three/addons/tsl/display/hashBlur.js';

import { GUI } from 'three/addons/libs/lil-gui.module.min.js';

import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';

import { OrbitControls } from 'three/addons/controls/OrbitControls.js';

/* POLYFILL */
import * as polyfill from "../polyfill/polyfill.ts";
await polyfill.init("three.js - WebGPU - Backdrop Area");

let camera, scene, renderer;
let mixer, clock;

init();

function init() {

	camera = new THREE.PerspectiveCamera( 50, window.innerWidth / window.innerHeight, 0.25, 25 );
	camera.position.set( 3, 2, 3 );

	scene = new THREE.Scene();
	scene.backgroundNode = hue( screenUV.y.mix( color( 0x66bbff ), color( 0x4466ff ) ), time.mul( 0.1 ) );
	camera.lookAt( 0, 1, 0 );

	clock = new THREE.Clock();

	const ambient = new THREE.AmbientLight( 0xffffff, 2.5 );
	scene.add( ambient );

	// model

	const loader = new GLTFLoader();
	loader.load( 'models/gltf/Michelle.glb', function ( gltf ) {

		const object = gltf.scene;
		mixer = new THREE.AnimationMixer( object );

		const action = mixer.clipAction( gltf.animations[ 0 ] );
		action.play();

		scene.add( object );

	} );

	// volume

	// compare depth from viewportLinearDepth with linearDepth() to create a distance field
	// viewportLinearDepth return the linear depth of the scene
	// linearDepth() returns the linear depth of the mesh
	const depthDistance = viewportLinearDepth.distance( linearDepth() );

	const depthAlphaNode = depthDistance.oneMinus().smoothstep( .90, 2 ).mul( 10 ).saturate();
	const depthBlurred = hashBlur( viewportSharedTexture(), depthDistance.smoothstep( 0, .6 ).mul( 40 ).clamp().mul( .1 ) );

	const blurredBlur = new THREE.MeshBasicNodeMaterial();
	blurredBlur.backdropNode = depthBlurred.add( depthAlphaNode.mix( color( 0x003399 ).mul( .3 ), 0 ) );
	blurredBlur.transparent = true;
	blurredBlur.side = THREE.DoubleSide;

	const depthMaterial = new THREE.MeshBasicNodeMaterial();
	depthMaterial.backdropNode = depthAlphaNode;
	depthMaterial.transparent = true;
	depthMaterial.side = THREE.DoubleSide;

	const checkerMaterial = new THREE.MeshBasicNodeMaterial();
	checkerMaterial.backdropNode = hashBlur( viewportSharedTexture(), .05 );
	checkerMaterial.backdropAlphaNode = checker( uv().mul( 3 ).mul( modelScale.xy ) );
	checkerMaterial.opacityNode = checkerMaterial.backdropAlphaNode;
	checkerMaterial.transparent = true;
	checkerMaterial.side = THREE.DoubleSide;

	const pixelMaterial = new THREE.MeshBasicNodeMaterial();
	pixelMaterial.backdropNode = viewportSharedTexture( screenUV.mul( 100 ).floor().div( 100 ) );
	pixelMaterial.transparent = true;

	// box / floor

	const box = new THREE.Mesh( new THREE.BoxGeometry( 2, 2, 2 ), blurredBlur );
	box.position.set( 0, 1, 0 );
	box.renderOrder = 1;
	scene.add( box );

	const floor = new THREE.Mesh( new THREE.BoxGeometry( 5, .01, 5 ), new THREE.MeshBasicNodeMaterial( {
		color: 0xff6600,
		opacityNode: positionWorld.xz.distance( 0 ).oneMinus().clamp(),
		transparent: true,
		depthWrite: false
	} ) );
	floor.position.set( 0, 0, 0 );
	scene.add( floor );

	// renderer

	renderer = new THREE.WebGPURenderer( /*{ antialias: true }*/ );
	renderer.setPixelRatio( window.devicePixelRatio );
	renderer.setSize( window.innerWidth, window.innerHeight );
	renderer.setAnimationLoop( animate );
	renderer.toneMapping = THREE.NeutralToneMapping;
	renderer.toneMappingExposure = .9;
	document.body.appendChild( renderer.domElement );

	const controls = new OrbitControls( camera, renderer.domElement );
	controls.target.set( 0, 1, 0 );
	controls.update();

	window.addEventListener( 'resize', onWindowResize );

	// gui

	const materials = {
		'blurred': blurredBlur,
		'depth': depthMaterial,
		'checker': checkerMaterial,
		'pixel': pixelMaterial
	};

	const gui = new GUI();
	const options = { material: 'blurred' };

	box.material = materials[ options.material ];

	gui.add( box.scale, 'x', 0.1, 2, 0.01 );
	gui.add( box.scale, 'z', 0.1, 2, 0.01 );
	gui.add( options, 'material', Object.keys( materials ) ).onChange( name => {

		box.material = materials[ name ];

	} );

}

function onWindowResize() {

	camera.aspect = window.innerWidth / window.innerHeight;
	camera.updateProjectionMatrix();

	renderer.setSize( window.innerWidth, window.innerHeight );

}

function animate() {

	const delta = clock.getDelta();

	if ( mixer ) mixer.update( delta );

	renderer.render( scene, camera );

}
