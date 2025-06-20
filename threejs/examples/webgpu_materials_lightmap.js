// https://github.com/mrdoob/three.js/blob/r175/examples/webgpu_materials_lightmap.html

import * as THREE from 'three';
import { vec4, color, positionLocal, mix } from 'three/tsl';

import Stats from 'three/addons/libs/stats.module.js';

import { OrbitControls } from 'three/addons/controls/OrbitControls.js';

/* POLYFILL */
import * as polyfill from "../polyfill/polyfill.ts";
await polyfill.init("three.js webgpu - lightmap");

let container, stats;
let camera, scene, renderer;

init();

async function init() {

	const { innerWidth, innerHeight } = window;

	container = document.createElement( 'div' );
	document.body.appendChild( container );

	// CAMERA

	camera = new THREE.PerspectiveCamera( 40, innerWidth / innerHeight, 1, 10000 );
	camera.position.set( 700, 200, - 500 );

	// SCENE

	scene = new THREE.Scene();

	// LIGHTS

	const light = new THREE.DirectionalLight( 0xd5deff );
	light.position.x = 300;
	light.position.y = 250;
	light.position.z = - 500;
	scene.add( light );

	// SKYDOME

	const topColor = new THREE.Color().copy( light.color );
	const bottomColor = new THREE.Color( 0xffffff );
	const offset = 400;
	const exponent = 0.6;

	const h = positionLocal.add( offset ).normalize().y;

	const skyMat = new THREE.MeshBasicNodeMaterial();
	skyMat.colorNode = vec4( mix( color( bottomColor ), color( topColor ), h.max( 0.0 ).pow( exponent ) ), 1.0 );
	skyMat.side = THREE.BackSide;

	const sky = new THREE.Mesh( new THREE.SphereGeometry( 4000, 32, 15 ), skyMat );
	scene.add( sky );

	// MODEL

	const loader = new THREE.ObjectLoader();
	const object = await loader.loadAsync( 'models/json/lightmap/lightmap.json' );
	scene.add( object );

	// RENDERER

	renderer = new THREE.WebGPURenderer( { antialias: true } );
	renderer.setAnimationLoop( animate );
	renderer.setPixelRatio( window.devicePixelRatio );
	renderer.setSize( innerWidth, innerHeight );
	container.appendChild( renderer.domElement );

	// CONTROLS

	const controls = new OrbitControls( camera, renderer.domElement );
	controls.maxPolarAngle = 0.9 * Math.PI / 2;
	controls.enableZoom = false;

	// STATS

	stats = new Stats();
	container.appendChild( stats.dom );

	//

	window.addEventListener( 'resize', onWindowResize );

}

function onWindowResize() {

	camera.aspect = window.innerWidth / window.innerHeight;
	camera.updateProjectionMatrix();

	renderer.setSize( window.innerWidth, window.innerHeight );

}

//

function animate() {

	renderer.render( scene, camera );
	stats.update();

}
