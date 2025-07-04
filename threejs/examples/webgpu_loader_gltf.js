// https://github.com/mrdoob/three.js/blob/r175/examples/webgpu_loader_gltf.html

import * as THREE from 'three';

import { RGBELoader } from 'three/addons/loaders/RGBELoader.js';

import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';

/* POLYFILL */
import * as polyfill from "../polyfill/polyfill.ts";
await polyfill.init("three.js webgpu - gltf loader");

let camera, scene, renderer;

init();
render();

function init() {

	const container = document.createElement( 'div' );
	document.body.appendChild( container );

	camera = new THREE.PerspectiveCamera( 45, window.innerWidth / window.innerHeight, 0.25, 20 );
	camera.position.set( - 1.8, 0.6, 2.7 );

	scene = new THREE.Scene();

	new RGBELoader()
		.setPath( 'textures/equirectangular/' )
		.load( 'royal_esplanade_1k.hdr', function ( texture ) {

			texture.mapping = THREE.EquirectangularReflectionMapping;
			//texture.minFilter = THREE.LinearMipmapLinearFilter;
			//texture.generateMipmaps = true;

			scene.background = texture;
			scene.environment = texture;

			render();

			// model

			const loader = new GLTFLoader().setPath( 'models/gltf/DamagedHelmet/glTF/' );
			loader.load( 'DamagedHelmet.gltf', function ( gltf ) {

				scene.add( gltf.scene );

				render();

			} );

		} );


	renderer = new THREE.WebGPURenderer( { antialias: true } );
	renderer.setPixelRatio( window.devicePixelRatio );
	renderer.setSize( window.innerWidth, window.innerHeight );
	renderer.toneMapping = THREE.ACESFilmicToneMapping;
	container.appendChild( renderer.domElement );

	const controls = new OrbitControls( camera, renderer.domElement );
	controls.addEventListener( 'change', render ); // use if there is no animation loop
	controls.minDistance = 2;
	controls.maxDistance = 10;
	controls.target.set( 0, 0, - 0.2 );
	controls.update();

	window.addEventListener( 'resize', onWindowResize );

}

function onWindowResize() {

	camera.aspect = window.innerWidth / window.innerHeight;
	camera.updateProjectionMatrix();

	renderer.setSize( window.innerWidth, window.innerHeight );

	render();

}

//

function render() {

	renderer.renderAsync( scene, camera );

}
