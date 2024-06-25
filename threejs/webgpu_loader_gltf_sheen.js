// https://github.com/mrdoob/three.js/blob/r165/examples/webgpu_loader_gltf_sheen.html

import * as THREE from 'three';

import WebGPU from 'three/addons/capabilities/WebGPU.js';
import WebGL from 'three/addons/capabilities/WebGL.js';

import WebGPURenderer from 'three/addons/renderers/webgpu/WebGPURenderer.js';

import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { RGBELoader } from 'three/addons/loaders/RGBELoader.js';

import { GUI } from 'three/addons/libs/lil-gui.module.min.js';

/* POLYFILL */
import * as polyfill from "./polyfill.ts";
await polyfill.init("three.js webgpu - sheen");

let camera, scene, renderer, controls;

init();

function init() {

	if ( WebGPU.isAvailable() === false && WebGL.isWebGL2Available() === false ) {

		document.body.appendChild( WebGPU.getErrorMessage() );

		throw new Error( 'No WebGPU or WebGL2 support' );

	}

	const container = document.createElement( 'div' );
	document.body.appendChild( container );

	camera = new THREE.PerspectiveCamera( 45, window.innerWidth / window.innerHeight, 0.1, 20 );
	camera.position.set( - 0.75, 0.7, 1.25 );

	scene = new THREE.Scene();
	//scene.add( new THREE.DirectionalLight( 0xffffff, 2 ) );

	// model

	new GLTFLoader()
		.setPath( 'models/gltf/' )
		.load( 'SheenChair.glb', function ( gltf ) {

			scene.add( gltf.scene );

			const object = gltf.scene.getObjectByName( 'SheenChair_fabric' );

			const gui = new GUI();

			gui.add( object.material, 'sheen', 0, 1 );
			gui.open();

		} );

	renderer = new WebGPURenderer( { antialias: true } );
	renderer.setPixelRatio( window.devicePixelRatio );
	renderer.setSize( window.innerWidth, window.innerHeight );
	renderer.setAnimationLoop( animate );
	renderer.toneMapping = THREE.ACESFilmicToneMapping;
	renderer.toneMappingExposure = 1;
	container.appendChild( renderer.domElement );

	scene.background = new THREE.Color( 0xAAAAAA );

	new RGBELoader()
		.setPath( 'textures/equirectangular/' )
		.load( 'royal_esplanade_1k.hdr', function ( texture ) {

			texture.mapping = THREE.EquirectangularReflectionMapping;

			scene.background = texture;
			//scene.backgroundBlurriness = 1; // @TODO: Needs PMREM
			scene.environment = texture;

		} );

	controls = new OrbitControls( camera, renderer.domElement );
	controls.enableDamping = true;
	controls.minDistance = 1;
	controls.maxDistance = 10;
	controls.target.set( 0, 0.35, 0 );
	controls.update();

	window.addEventListener( 'resize', onWindowResize );

}

function onWindowResize() {

	camera.aspect = window.innerWidth / window.innerHeight;
	camera.updateProjectionMatrix();

	renderer.setSize( window.innerWidth, window.innerHeight );

}

//

function animate() {

	controls.update(); // required if damping enabled

	render();

}

function render() {

	renderer.render( scene, camera );

}
