// https://github.com/mrdoob/three.js/blob/r175/examples/webgpu_lights_phong.html

import * as THREE from 'three';
import { color, fog, rangeFogFactor, checker, uv, mix, texture, lights, normalMap } from 'three/tsl';

import Stats from 'three/addons/libs/stats.module.js';

import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { TeapotGeometry } from 'three/addons/geometries/TeapotGeometry.js';

/* POLYFILL */
import * as polyfill from "../polyfill/polyfill.ts";
await polyfill.init("three.js webgpu - phong lighting model");

let camera, scene, renderer,
	light1, light2, light3, light4,
	stats, controls;

init();

function init() {

	camera = new THREE.PerspectiveCamera( 50, window.innerWidth / window.innerHeight, 0.01, 100 );
	camera.position.z = 7;

	scene = new THREE.Scene();
	scene.fogNode = fog( color( 0xFF00FF ), rangeFogFactor( 12, 30 ) );

	const sphereGeometry = new THREE.SphereGeometry( 0.1, 16, 8 );

	// textures

	const textureLoader = new THREE.TextureLoader();

	const normalMapTexture = textureLoader.load( './textures/water/Water_1_M_Normal.jpg' );
	normalMapTexture.wrapS = THREE.RepeatWrapping;
	normalMapTexture.wrapT = THREE.RepeatWrapping;

	const alphaTexture = textureLoader.load( './textures/roughness_map.jpg' );
	alphaTexture.wrapS = THREE.RepeatWrapping;
	alphaTexture.wrapT = THREE.RepeatWrapping;

	// lights

	const addLight = ( hexColor, power = 1700, distance = 100 ) => {

		const material = new THREE.MeshPhongNodeMaterial();
		material.colorNode = color( hexColor );
		material.lights = false;

		const mesh = new THREE.Mesh( sphereGeometry, material );

		const light = new THREE.PointLight( hexColor, 1, distance );
		light.power = power;
		light.add( mesh );

		scene.add( light );

		return light;

	};

	light1 = addLight( 0x0040ff );
	light2 = addLight( 0xffffff );
	light3 = addLight( 0x80ff80 );
	light4 = addLight( 0xffaa00 );

	// light nodes ( selective lights )

	const blueLightsNode = lights( [ light1 ] );
	const whiteLightsNode = lights( [ light2 ] );

	// models

	const geometryTeapot = new TeapotGeometry( .8, 18 );

	const leftObject = new THREE.Mesh( geometryTeapot, new THREE.MeshPhongNodeMaterial( { color: 0x555555 } ) );
	leftObject.material.lightsNode = blueLightsNode;
	leftObject.material.specularNode = texture( alphaTexture );
	leftObject.position.x = - 3;
	scene.add( leftObject );

	const centerObject = new THREE.Mesh( geometryTeapot, new THREE.MeshPhongNodeMaterial( { color: 0x555555 } ) );
	centerObject.material.normalNode = normalMap( texture( normalMapTexture ) );
	centerObject.material.shininess = 80;
	scene.add( centerObject );

	const rightObject = new THREE.Mesh( geometryTeapot, new THREE.MeshPhongNodeMaterial( { color: 0x555555 } ) );
	rightObject.material.lightsNode = whiteLightsNode;
	//rightObject.material.specular.setHex( 0xFF00FF );
	rightObject.material.specularNode = mix( color( 0x0000FF ), color( 0xFF0000 ), checker( uv().mul( 5 ) ) );
	rightObject.material.shininess = 90;
	rightObject.position.x = 3;
	scene.add( rightObject );

	leftObject.rotation.y = centerObject.rotation.y = rightObject.rotation.y = Math.PI * - 0.5;
	leftObject.position.y = centerObject.position.y = rightObject.position.y = - 1;

	// renderer

	renderer = new THREE.WebGPURenderer( { antialias: true } );
	renderer.setPixelRatio( window.devicePixelRatio );
	renderer.setSize( window.innerWidth, window.innerHeight );
	renderer.setAnimationLoop( animate );
	document.body.appendChild( renderer.domElement );

	// controls

	controls = new OrbitControls( camera, renderer.domElement );
	controls.minDistance = 3;
	controls.maxDistance = 25;

	// stats

	stats = new Stats();
	document.body.appendChild( stats.dom );

	window.addEventListener( 'resize', onWindowResize );

}

function onWindowResize() {

	camera.aspect = window.innerWidth / window.innerHeight;
	camera.updateProjectionMatrix();

	renderer.setSize( window.innerWidth, window.innerHeight );

}

function animate() {

	const time = performance.now() / 1000;
	const lightTime = time * 0.5;

	light1.position.x = Math.sin( lightTime * 0.7 ) * 3;
	light1.position.y = Math.cos( lightTime * 0.5 ) * 4;
	light1.position.z = Math.cos( lightTime * 0.3 ) * 3;

	light2.position.x = Math.cos( lightTime * 0.3 ) * 3;
	light2.position.y = Math.sin( lightTime * 0.5 ) * 4;
	light2.position.z = Math.sin( lightTime * 0.7 ) * 3;

	light3.position.x = Math.sin( lightTime * 0.7 ) * 3;
	light3.position.y = Math.cos( lightTime * 0.3 ) * 4;
	light3.position.z = Math.sin( lightTime * 0.5 ) * 3;

	light4.position.x = Math.sin( lightTime * 0.3 ) * 3;
	light4.position.y = Math.cos( lightTime * 0.7 ) * 4;
	light4.position.z = Math.sin( lightTime * 0.5 ) * 3;

	renderer.render( scene, camera );

	stats.update();

}
