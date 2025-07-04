// https://github.com/mrdoob/three.js/blob/r175/examples/webgpu_parallax_uv.html

import * as THREE from 'three';
import { texture, parallaxUV, blendOverlay, uv } from 'three/tsl';

import { OrbitControls } from 'three/addons/controls/OrbitControls.js';

/* POLYFILL */
import * as polyfill from "../polyfill/polyfill.ts";
await polyfill.init("three.js webgpu - parallax uv");

let camera, scene, renderer;

let controls;

init();

async function init() {

	// scene

	scene = new THREE.Scene();

	// camera

	camera = new THREE.PerspectiveCamera( 45, window.innerWidth / window.innerHeight, .1, 50 );
	camera.position.set( 10, 14, 10 );

	// environment

	const environmentTexture = await new THREE.CubeTextureLoader()
		.setPath( './textures/cube/Park2/' )
		.loadAsync( [ 'posx.jpg', 'negx.jpg', 'posy.jpg', 'negy.jpg', 'posz.jpg', 'negz.jpg' ] );


	scene.environment = environmentTexture;
	scene.background = environmentTexture;

	// textures

	const loader = new THREE.TextureLoader();

	const topTexture = await loader.loadAsync( 'textures/ambientcg/Ice002_1K-JPG_Color.jpg' );
	topTexture.colorSpace = THREE.SRGBColorSpace;

	const roughnessTexture = await loader.loadAsync( 'textures/ambientcg/Ice002_1K-JPG_Roughness.jpg' );
	roughnessTexture.colorSpace = THREE.NoColorSpace;

	const normalTexture = await loader.loadAsync( 'textures/ambientcg/Ice002_1K-JPG_NormalGL.jpg' );
	normalTexture.colorSpace = THREE.NoColorSpace;

	const displaceTexture = await loader.loadAsync( 'textures/ambientcg/Ice002_1K-JPG_Displacement.jpg' );
	displaceTexture.colorSpace = THREE.NoColorSpace;

	//

	const bottomTexture = await loader.loadAsync( 'textures/ambientcg/Ice003_1K-JPG_Color.jpg' );
	bottomTexture.colorSpace = THREE.SRGBColorSpace;
	bottomTexture.wrapS = THREE.RepeatWrapping;
	bottomTexture.wrapT = THREE.RepeatWrapping;

	// parallax effect

	const parallaxScale = .3;
	const offsetUV = texture( displaceTexture ).mul( parallaxScale );

	const parallaxUVOffset = parallaxUV( uv(), offsetUV );
	const parallaxResult = texture( bottomTexture, parallaxUVOffset );

	const iceNode = blendOverlay( texture( topTexture ), parallaxResult );

	// material

	const material = new THREE.MeshStandardNodeMaterial();
	material.colorNode = iceNode.mul( 5 ); // increase the color intensity to 5 ( contrast )
	material.roughnessNode = texture( roughnessTexture );
	material.normalMap = normalTexture;
	material.metalness = 0;

	const geometry = new THREE.BoxGeometry( 10, 10, 10 );

	const ground = new THREE.Mesh( geometry, material );
	ground.rotateX( - Math.PI / 2 );
	scene.add( ground );

	// renderer

	renderer = new THREE.WebGPURenderer( { antialias: true } );
	renderer.setPixelRatio( window.devicePixelRatio );
	renderer.setSize( window.innerWidth, window.innerHeight );
	renderer.setAnimationLoop( animate );
	renderer.toneMapping = THREE.ReinhardToneMapping;
	renderer.toneMappingExposure = 6;
	document.body.appendChild( renderer.domElement );

	// controls

	controls = new OrbitControls( camera, renderer.domElement );
	controls.target.set( 0, 0, 0 );
	controls.maxDistance = 40;
	controls.minDistance = 10;
	controls.autoRotate = true;
	controls.autoRotateSpeed = - 1;
	controls.update();

	window.addEventListener( 'resize', onWindowResize );

}

function onWindowResize() {

	camera.aspect = window.innerWidth / window.innerHeight;
	camera.updateProjectionMatrix();

	renderer.setSize( window.innerWidth, window.innerHeight );

}

function animate() {

	controls.update();

	renderer.render( scene, camera );

}
