// https://github.com/mrdoob/three.js/blob/r175/examples/webgpu_postprocessing_smaa.html

import * as THREE from 'three';
import { pass } from 'three/tsl';
import { smaa } from 'three/addons/tsl/display/SMAANode.js';

import Stats from 'three/addons/libs/stats.module.js';
import { GUI } from 'three/addons/libs/lil-gui.module.min.js';

/* POLYFILL */
import * as polyfill from "../polyfill/polyfill.ts";
await polyfill.init("three.js webgpu - postprocessing smaa");

let camera, scene, renderer, postProcessing, stats;

const params = {
	enabled: true,
	autoRotate: true

};

init();

function init() {

	renderer = new THREE.WebGPURenderer();
	renderer.setPixelRatio( window.devicePixelRatio );
	renderer.setSize( window.innerWidth, window.innerHeight );
	renderer.setAnimationLoop( animate );
	document.body.appendChild( renderer.domElement );

	stats = new Stats();
	document.body.appendChild( stats.dom );

	//

	camera = new THREE.PerspectiveCamera( 70, window.innerWidth / window.innerHeight, 1, 1000 );
	camera.position.z = 300;

	scene = new THREE.Scene();

	const geometry = new THREE.BoxGeometry( 120, 120, 120 );
	const material1 = new THREE.MeshBasicMaterial( { color: 0xffffff, wireframe: true } );

	const mesh1 = new THREE.Mesh( geometry, material1 );
	mesh1.position.x = - 100;
	scene.add( mesh1 );

	const texture = new THREE.TextureLoader().load( 'textures/brick_diffuse.jpg' );
	texture.colorSpace = THREE.SRGBColorSpace;

	const material2 = new THREE.MeshBasicMaterial( { map: texture } );

	const mesh2 = new THREE.Mesh( geometry, material2 );
	mesh2.position.x = 100;
	scene.add( mesh2 );

	// post processing

	postProcessing = new THREE.PostProcessing( renderer );

	const scenePass = pass( scene, camera );
	const smaaPass = smaa( scenePass );

	postProcessing.outputNode = smaaPass;

	//

	window.addEventListener( 'resize', onWindowResize );

	const gui = new GUI();

	const smaaFolder = gui.addFolder( 'SMAA' );
	smaaFolder.add( params, 'enabled' ).onChange( ( value ) => {

		if ( value === true ) {

			postProcessing.outputNode = smaaPass;

		} else {

			postProcessing.outputNode = scenePass;

		}

		postProcessing.needsUpdate = true;

	} );

	const sceneFolder = gui.addFolder( 'Scene' );
	sceneFolder.add( params, 'autoRotate' );

}

function onWindowResize() {

	const width = window.innerWidth;
	const height = window.innerHeight;

	camera.aspect = width / height;
	camera.updateProjectionMatrix();

	renderer.setSize( width, height );

}

function animate() {

	stats.begin();

	if ( params.autoRotate === true ) {

		for ( let i = 0; i < scene.children.length; i ++ ) {

			const child = scene.children[ i ];

			child.rotation.x += 0.005;
			child.rotation.y += 0.01;

		}

	}

	postProcessing.render();

	stats.end();

}
