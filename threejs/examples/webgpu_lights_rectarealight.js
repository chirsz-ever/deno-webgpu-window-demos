// https://github.com/mrdoob/three.js/blob/r175/examples/webgpu_lights_rectarealight.html

import * as THREE from 'three';

import Stats from 'three/addons/libs/stats.module.js';

import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { RectAreaLightHelper } from 'three/addons/helpers/RectAreaLightHelper.js';
import { RectAreaLightTexturesLib } from 'three/addons/lights/RectAreaLightTexturesLib.js';

/* POLYFILL */
import * as polyfill from "../polyfill/polyfill.ts";
await polyfill.init("three.js webGPU - rect area light");

let renderer, scene, camera;
let stats, meshKnot;

init();

function init() {

	THREE.RectAreaLightNode.setLTC( RectAreaLightTexturesLib.init() );

	renderer = new THREE.WebGPURenderer( { antialias: true } );
	renderer.setPixelRatio( window.devicePixelRatio );
	renderer.setSize( window.innerWidth, window.innerHeight );
	renderer.setAnimationLoop( animation );
	document.body.appendChild( renderer.domElement );

	camera = new THREE.PerspectiveCamera( 45, window.innerWidth / window.innerHeight, 1, 1000 );
	camera.position.set( 0, 5, - 15 );

	scene = new THREE.Scene();

	const rectLight1 = new THREE.RectAreaLight( 0xff0000, 5, 4, 10 );
	rectLight1.position.set( - 5, 5, 5 );
	scene.add( rectLight1 );

	const rectLight2 = new THREE.RectAreaLight( 0x00ff00, 5, 4, 10 );
	rectLight2.position.set( 0, 5, 5 );
	scene.add( rectLight2 );

	const rectLight3 = new THREE.RectAreaLight( 0x0000ff, 5, 4, 10 );
	rectLight3.position.set( 5, 5, 5 );
	scene.add( rectLight3 );

	scene.add( new RectAreaLightHelper( rectLight1 ) );
	scene.add( new RectAreaLightHelper( rectLight2 ) );
	scene.add( new RectAreaLightHelper( rectLight3 ) );

	const geoFloor = new THREE.BoxGeometry( 2000, 0.1, 2000 );
	const matStdFloor = new THREE.MeshStandardMaterial( { color: 0xbcbcbc, roughness: 0.1, metalness: 0 } );
	const mshStdFloor = new THREE.Mesh( geoFloor, matStdFloor );
	scene.add( mshStdFloor );

	const geoKnot = new THREE.TorusKnotGeometry( 1.5, 0.5, 200, 16 );
	const matKnot = new THREE.MeshStandardMaterial( { color: 0xffffff, roughness: 0, metalness: 0 } );
	meshKnot = new THREE.Mesh( geoKnot, matKnot );
	meshKnot.position.set( 0, 5, 0 );
	scene.add( meshKnot );

	const controls = new OrbitControls( camera, renderer.domElement );
	controls.target.copy( meshKnot.position );
	controls.update();

	//

	window.addEventListener( 'resize', onWindowResize );

	stats = new Stats();
	document.body.appendChild( stats.dom );

}

function onWindowResize() {

	renderer.setSize( window.innerWidth, window.innerHeight );
	camera.aspect = ( window.innerWidth / window.innerHeight );
	camera.updateProjectionMatrix();

}

function animation( time ) {

	meshKnot.rotation.y = time / 1000;

	renderer.render( scene, camera );

	stats.update();

}
