// https://github.com/mrdoob/three.js/blob/r175/examples/webgpu_pmrem_scene.html

import * as THREE from 'three';
import { normalWorld, uniform, pmremTexture } from 'three/tsl';

import { OrbitControls } from 'three/addons/controls/OrbitControls.js';

import { GUI } from 'three/addons/libs/lil-gui.module.min.js';

/* POLYFILL */
import * as polyfill from "../polyfill/polyfill.ts";
await polyfill.init("three.js webgpu - pmrem scene");

let camera, scene, renderer;

init();

async function init() {

	const container = document.createElement( 'div' );
	document.body.appendChild( container );

	camera = new THREE.PerspectiveCamera( 45, window.innerWidth / window.innerHeight, 0.25, 20 );
	camera.position.set( - 1.8, 0.6, 2.7 );

	scene = new THREE.Scene();

	const forceWebGL = false;

	renderer = new THREE.WebGPURenderer( { antialias: true, forceWebGL } );
	renderer.setPixelRatio( window.devicePixelRatio );
	renderer.setSize( window.innerWidth, window.innerHeight );
	container.appendChild( renderer.domElement );

	await renderer.init();

	const controls = new OrbitControls( camera, renderer.domElement );
	controls.addEventListener( 'change', render ); // use if there is no animation loop
	controls.minDistance = 2;
	controls.maxDistance = 10;
	controls.update();

	//
	const loader = new THREE.CubeTextureLoader().setPath( './textures/cube/Park3Med/' );

	scene.background = await loader.loadAsync( [ 'px.jpg', 'nx.jpg', 'py.jpg', 'ny.jpg', 'pz.jpg', 'nz.jpg' ] );

	let model;

	model = new THREE.Mesh( new THREE.SphereGeometry( .2, 64, 64 ), new THREE.MeshBasicMaterial( { color: 0x0000ff } ) );
	model.position.z -= 1;
	scene.add( model );

	model = new THREE.Mesh( new THREE.SphereGeometry( .2, 64, 64 ), new THREE.MeshBasicMaterial( { color: 0xff0000 } ) );
	model.position.z += 1;
	scene.add( model );

	model = new THREE.Mesh( new THREE.SphereGeometry( .2, 64, 64 ), new THREE.MeshBasicMaterial( { color: 0xff00ff } ) );
	model.position.x += 1;
	scene.add( model );

	model = new THREE.Mesh( new THREE.SphereGeometry( .2, 64, 64 ), new THREE.MeshBasicMaterial( { color: 0x00ffff } ) );
	model.position.x -= 1;
	scene.add( model );

	model = new THREE.Mesh( new THREE.SphereGeometry( .2, 64, 64 ), new THREE.MeshBasicMaterial( { color: 0xffff00 } ) );
	model.position.y -= 1;
	scene.add( model );

	model = new THREE.Mesh( new THREE.SphereGeometry( .2, 64, 64 ), new THREE.MeshBasicMaterial( { color: 0x00ff00 } ) );
	model.position.y += 1;
	scene.add( model );

	//while ( scene.children.length > 0 ) scene.remove( scene.children[ 0 ] );

	const sceneRT = new THREE.PMREMGenerator( renderer ).fromScene( scene );


	//

	const pmremRoughness = uniform( .5 );
	const pmremNode = pmremTexture( sceneRT.texture, normalWorld, pmremRoughness );

	scene.add( new THREE.Mesh( new THREE.SphereGeometry( .5, 64, 64 ), new THREE.MeshBasicNodeMaterial( { colorNode: pmremNode } ) ) );

	// gui

	const gui = new GUI();
	gui.add( pmremRoughness, 'value', 0, 1, 0.001 ).name( 'roughness' ).onChange( () => render() );

	render();

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

	renderer.render( scene, camera );

}
