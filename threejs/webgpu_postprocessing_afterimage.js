// https://github.com/mrdoob/three.js/blob/r164/examples/webgpu_postprocessing_afterimage.html

import * as THREE from 'three';

import { GUI } from 'three/addons/libs/lil-gui.module.min.js';

import WebGPURenderer from 'three/addons/renderers/webgpu/WebGPURenderer.js';
import PostProcessing from 'three/addons/renderers/common/PostProcessing.js';
import { pass } from 'three/nodes';

let camera, scene, renderer;
let mesh, postProcessing, combinedPass;

const params = {

	damp: 0.96

};

/* POLYFILL */
import * as polyfill from "./polyfill.ts";
await polyfill.init("three.js webgpu - postprocessing - afterimage");

init();
createGUI();

function init() {

	renderer = new WebGPURenderer( { antialias: true } );
	renderer.setPixelRatio( window.devicePixelRatio );
	renderer.setSize( window.innerWidth, window.innerHeight );
	renderer.setAnimationLoop( animate );
	document.body.appendChild( renderer.domElement );

	camera = new THREE.PerspectiveCamera( 70, window.innerWidth / window.innerHeight, 1, 1000 );
	camera.position.z = 400;

	scene = new THREE.Scene();
	scene.fog = new THREE.Fog( 0x000000, 1, 1000 );

	const geometry = new THREE.TorusKnotGeometry( 100, 30, 100, 16 );
	const material = new THREE.MeshNormalMaterial();
	mesh = new THREE.Mesh( geometry, material );
	scene.add( mesh );

	// postprocessing

	postProcessing = new PostProcessing( renderer );

	const scenePass = pass( scene, camera );
	const scenePassColor = scenePass.getTextureNode();

	combinedPass = scenePassColor;
	combinedPass = combinedPass.afterImage( params.damp );

	postProcessing.outputNode = combinedPass;

	window.addEventListener( 'resize', onWindowResize );

}

function createGUI() {

	const gui = new GUI( { title: 'Damp setting' } );
	gui.add( combinedPass.damp, 'value', 0, 1 ).step( 0.001 );

}

function onWindowResize() {

	camera.aspect = window.innerWidth / window.innerHeight;
	camera.updateProjectionMatrix();

	renderer.setSize( window.innerWidth, window.innerHeight );

}

function render() {

	mesh.rotation.x += 0.0075;
	mesh.rotation.y += 0.015;


	postProcessing.render();

}

function animate() {

	render();

}
