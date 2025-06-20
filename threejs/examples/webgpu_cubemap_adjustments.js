// https://github.com/mrdoob/three.js/blob/r175/examples/webgpu_cubemap_adjustments.html

import * as THREE from 'three';
import { uniform, mix, pmremTexture, reference, positionLocal, hue, saturation, positionWorld, normalWorld, positionWorldDirection, reflectVector } from 'three/tsl';

import { RGBMLoader } from 'three/addons/loaders/RGBMLoader.js';

import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';

import { GUI } from 'three/addons/libs/lil-gui.module.min.js';

/* POLYFILL */
import * as polyfill from "../polyfill/polyfill.ts";
await polyfill.init("three.js webgpu - cubemap adjustments");

let camera, scene, renderer;

init();

async function init() {

	const container = document.createElement( 'div' );
	document.body.appendChild( container );

	const initialDistance = 2;

	camera = new THREE.PerspectiveCamera( 45, window.innerWidth / window.innerHeight, 0.25, 20 );
	camera.position.set( - 1.8 * initialDistance, 0.6 * initialDistance, 2.7 * initialDistance );

	scene = new THREE.Scene();

	// cube textures

	const rgbmUrls = [ 'px.png', 'nx.png', 'py.png', 'ny.png', 'pz.png', 'nz.png' ];
	const cube1Texture = await new RGBMLoader()
		.setMaxRange( 16 )
		.setPath( './textures/cube/pisaRGBM16/' )
		.loadCubemapAsync( rgbmUrls );

	cube1Texture.generateMipmaps = true;
	cube1Texture.minFilter = THREE.LinearMipmapLinearFilter;

	const cube2Urls = [ 'posx.jpg', 'negx.jpg', 'posy.jpg', 'negy.jpg', 'posz.jpg', 'negz.jpg' ];
	const cube2Texture = await new THREE.CubeTextureLoader()
		.setPath( './textures/cube/Park2/' )
		.loadAsync( cube2Urls );

	cube2Texture.generateMipmaps = true;
	cube2Texture.minFilter = THREE.LinearMipmapLinearFilter;

	// nodes and environment

	const adjustments = {
		mix: 0,
		procedural: 0,
		intensity: 1,
		hue: 0,
		saturation: 1
	};

	const mixNode = reference( 'mix', 'float', adjustments );
	const proceduralNode = reference( 'procedural', 'float', adjustments );
	const intensityNode = reference( 'intensity', 'float', adjustments );
	const hueNode = reference( 'hue', 'float', adjustments );
	const saturationNode = reference( 'saturation', 'float', adjustments );

	const rotateY1Matrix = new THREE.Matrix4();
	const rotateY2Matrix = new THREE.Matrix4();

	const getEnvironmentNode = ( reflectNode, positionNode ) => {

		const custom1UV = reflectNode.xyz.mul( uniform( rotateY1Matrix ) );
		const custom2UV = reflectNode.xyz.mul( uniform( rotateY2Matrix ) );
		const mixCubeMaps = mix( pmremTexture( cube1Texture, custom1UV ), pmremTexture( cube2Texture, custom2UV ), positionNode.y.add( mixNode ).clamp() );

		const proceduralEnv = mix( mixCubeMaps, normalWorld, proceduralNode );

		const intensityFilter = proceduralEnv.mul( intensityNode );
		const hueFilter = hue( intensityFilter, hueNode );
		return saturation( hueFilter, saturationNode );

	};

	const blurNode = uniform( 0 );

	scene.environmentNode = getEnvironmentNode( reflectVector, positionWorld );

	scene.backgroundNode = getEnvironmentNode( positionWorldDirection, positionLocal ).context( {
		getTextureLevel: () => blurNode
	} );

	// scene objects

	const loader = new GLTFLoader().setPath( 'models/gltf/DamagedHelmet/glTF/' );
	const gltf = await loader.loadAsync( 'DamagedHelmet.gltf' );

	scene.add( gltf.scene );

	const sphereGeometry = new THREE.SphereGeometry( .5, 64, 32 );

	const sphereRightView = new THREE.Mesh( sphereGeometry, new THREE.MeshStandardMaterial( { roughness: 0, metalness: 1 } ) );
	sphereRightView.position.x += 2;

	const sphereLeftView = new THREE.Mesh( sphereGeometry, new THREE.MeshStandardMaterial( { roughness: 1, metalness: 1 } ) );
	sphereLeftView.position.x -= 2;

	scene.add( sphereLeftView );
	scene.add( sphereRightView );

	// renderer and controls

	renderer = new THREE.WebGPURenderer( { antialias: true } );
	renderer.setPixelRatio( window.devicePixelRatio );
	renderer.setSize( window.innerWidth, window.innerHeight );
	renderer.toneMapping = THREE.LinearToneMapping;
	renderer.setAnimationLoop( render );
	container.appendChild( renderer.domElement );

	const controls = new OrbitControls( camera, renderer.domElement );
	controls.minDistance = 2;
	controls.maxDistance = 10;

	window.addEventListener( 'resize', onWindowResize );

	// gui

	const gui = new GUI();

	gui.add( { blurBackground: blurNode.value }, 'blurBackground', 0, 1, 0.01 ).onChange( value => {

		blurNode.value = value;

	} );
	gui.add( { offsetCube1: 0 }, 'offsetCube1', 0, Math.PI * 2, 0.01 ).onChange( value => {

		rotateY1Matrix.makeRotationY( value );

	} );
	gui.add( { offsetCube2: 0 }, 'offsetCube2', 0, Math.PI * 2, 0.01 ).onChange( value => {

		rotateY2Matrix.makeRotationY( value );

	} );
	gui.add( adjustments, 'mix', - 1, 2, 0.01 );
	gui.add( adjustments, 'procedural', 0, 1, 0.01 );
	gui.add( adjustments, 'intensity', 0, 5, 0.01 );
	gui.add( adjustments, 'hue', 0, Math.PI * 2, 0.01 );
	gui.add( adjustments, 'saturation', 0, 2, 0.01 );

}

function onWindowResize() {

	camera.aspect = window.innerWidth / window.innerHeight;
	camera.updateProjectionMatrix();

	renderer.setSize( window.innerWidth, window.innerHeight );

}

//

function render() {

	renderer.render( scene, camera );

}
