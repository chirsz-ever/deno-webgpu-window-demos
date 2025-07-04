// https://github.com/mrdoob/three.js/blob/r175/examples/webgpu_water.html

import * as THREE from 'three';

import { GUI } from 'three/addons/libs/lil-gui.module.min.js';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { WaterMesh } from 'three/addons/objects/Water2Mesh.js';

/* POLYFILL */
import * as polyfill from "../polyfill/polyfill.ts";
await polyfill.init("three.js - water");

let scene, camera, clock, renderer, water;

let torusKnot;

const params = {
	color: '#ffffff',
	scale: 4,
	flowX: 1,
	flowY: 1
};

init();

function init() {

	// scene

	scene = new THREE.Scene();

	// camera

	camera = new THREE.PerspectiveCamera( 45, window.innerWidth / window.innerHeight, 0.1, 200 );
	camera.position.set( - 15, 7, 15 );
	camera.lookAt( scene.position );

	// clock

	clock = new THREE.Clock();

	// mesh

	const torusKnotGeometry = new THREE.TorusKnotGeometry( 3, 1, 256, 32 );
	const torusKnotMaterial = new THREE.MeshNormalMaterial();

	torusKnot = new THREE.Mesh( torusKnotGeometry, torusKnotMaterial );
	torusKnot.position.y = 4;
	torusKnot.scale.set( 0.5, 0.5, 0.5 );
	scene.add( torusKnot );

	// ground

	const groundGeometry = new THREE.PlaneGeometry( 20, 20 );
	const groundMaterial = new THREE.MeshStandardMaterial( { roughness: 0.8, metalness: 0.4 } );
	const ground = new THREE.Mesh( groundGeometry, groundMaterial );
	ground.rotation.x = Math.PI * - 0.5;
	scene.add( ground );

	const textureLoader = new THREE.TextureLoader();
	textureLoader.load( 'textures/hardwood2_diffuse.jpg', function ( map ) {

		map.wrapS = THREE.RepeatWrapping;
		map.wrapT = THREE.RepeatWrapping;
		map.anisotropy = 16;
		map.repeat.set( 4, 4 );
		map.colorSpace = THREE.SRGBColorSpace;
		groundMaterial.map = map;
		groundMaterial.needsUpdate = true;

	} );

	//

	const normalMap0 = textureLoader.load( 'textures/water/Water_1_M_Normal.jpg' );
	const normalMap1 = textureLoader.load( 'textures/water/Water_2_M_Normal.jpg' );

	normalMap0.wrapS = normalMap0.wrapT = THREE.RepeatWrapping;
	normalMap1.wrapS = normalMap1.wrapT = THREE.RepeatWrapping;

	// water

	const waterGeometry = new THREE.PlaneGeometry( 20, 20 );

	water = new WaterMesh( waterGeometry, {
		color: params.color,
		scale: params.scale,
		flowDirection: new THREE.Vector2( params.flowX, params.flowY ),
		normalMap0: normalMap0,
		normalMap1: normalMap1
	} );

	water.position.y = 1;
	water.rotation.x = Math.PI * - 0.5;
	scene.add( water );

	// skybox

	const cubeTextureLoader = new THREE.CubeTextureLoader();
	cubeTextureLoader.setPath( 'textures/cube/Park2/' );

	const cubeTexture = cubeTextureLoader.load( [
		'posx.jpg', 'negx.jpg',
		'posy.jpg', 'negy.jpg',
		'posz.jpg', 'negz.jpg'
	] );

	scene.background = cubeTexture;

	// light

	const ambientLight = new THREE.AmbientLight( 0xe7e7e7, 1.2 );
	scene.add( ambientLight );

	const directionalLight = new THREE.DirectionalLight( 0xffffff, 2 );
	directionalLight.position.set( - 1, 1, 1 );
	scene.add( directionalLight );

	// renderer

	renderer = new THREE.WebGPURenderer();
	renderer.setSize( window.innerWidth, window.innerHeight );
	renderer.setPixelRatio( window.devicePixelRatio );
	renderer.setAnimationLoop( animate );
	document.body.appendChild( renderer.domElement );

	// gui

	const gui = new GUI();
	const waterNode = water.material.fragmentNode;

	gui.addColor( params, 'color' ).onChange( function ( value ) {

		waterNode.color.value.set( value );

	} );
	gui.add( params, 'scale', 1, 10 ).onChange( function ( value ) {

		waterNode.scale.value = value;

	} );
	gui.add( params, 'flowX', - 1, 1 ).step( 0.01 ).onChange( function ( value ) {

		waterNode.flowDirection.value.x = value;
		waterNode.flowDirection.value.normalize();

	} );
	gui.add( params, 'flowY', - 1, 1 ).step( 0.01 ).onChange( function ( value ) {

		waterNode.flowDirection.value.y = value;
		waterNode.flowDirection.value.normalize();

	} );

	gui.open();

	//

	const controls = new OrbitControls( camera, renderer.domElement );
	controls.minDistance = 5;
	controls.maxDistance = 50;

	//

	window.addEventListener( 'resize', onWindowResize );

}

function onWindowResize() {

	camera.aspect = window.innerWidth / window.innerHeight;
	camera.updateProjectionMatrix();
	renderer.setSize( window.innerWidth, window.innerHeight );

}

function animate() {

	const delta = clock.getDelta();

	torusKnot.rotation.x += delta;
	torusKnot.rotation.y += delta * 0.5;

	renderer.render( scene, camera );

}
