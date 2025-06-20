// https://github.com/mrdoob/three.js/blob/r175/examples/webgpu_materials_sss.html

import * as THREE from 'three/webgpu';
import { texture, uniform, vec3 } from 'three/tsl';

import Stats from 'three/addons/libs/stats.module.js';

import { GUI } from 'three/addons/libs/lil-gui.module.min.js';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { FBXLoader } from 'three/addons/loaders/FBXLoader.js';

/* POLYFILL */
import * as polyfill from "../polyfill/polyfill.ts";
await polyfill.init("three.js webgpu - sss");

let container, stats;
let camera, scene, renderer;
let model;

init();

function init() {

	container = document.createElement( 'div' );
	document.body.appendChild( container );

	camera = new THREE.PerspectiveCamera( 40, window.innerWidth / window.innerHeight, 1, 5000 );
	camera.position.set( 0.0, 300, 400 * 4 );

	scene = new THREE.Scene();

	// Lights

	scene.add( new THREE.AmbientLight( 0xc1c1c1 ) );

	const directionalLight = new THREE.DirectionalLight( 0xffffff, 0.03 );
	directionalLight.position.set( 0.0, 0.5, 0.5 ).normalize();
	scene.add( directionalLight );

	const pointLight1 = new THREE.Mesh( new THREE.SphereGeometry( 4, 8, 8 ), new THREE.MeshBasicMaterial( { color: 0xc1c1c1 } ) );
	pointLight1.add( new THREE.PointLight( 0xc1c1c1, 4.0, 300, 0 ) );
	scene.add( pointLight1 );
	pointLight1.position.x = 0;
	pointLight1.position.y = - 50;
	pointLight1.position.z = 350;

	const pointLight2 = new THREE.Mesh( new THREE.SphereGeometry( 4, 8, 8 ), new THREE.MeshBasicMaterial( { color: 0xc1c100 } ) );
	pointLight2.add( new THREE.PointLight( 0xc1c100, 0.75, 500, 0 ) );
	scene.add( pointLight2 );
	pointLight2.position.x = - 100;
	pointLight2.position.y = 20;
	pointLight2.position.z = - 260;

	renderer = new THREE.WebGPURenderer( { antialias: true } );
	renderer.setPixelRatio( window.devicePixelRatio );
	renderer.setSize( window.innerWidth, window.innerHeight );
	renderer.setAnimationLoop( animate );
	container.appendChild( renderer.domElement );

	//

	stats = new Stats();
	container.appendChild( stats.dom );

	const controls = new OrbitControls( camera, container );
	controls.minDistance = 500;
	controls.maxDistance = 3000;

	window.addEventListener( 'resize', onWindowResize );

	initMaterial();

}

function initMaterial() {

	const loader = new THREE.TextureLoader();
	const imgTexture = loader.load( 'models/fbx/white.jpg' );
	imgTexture.colorSpace = THREE.SRGBColorSpace;

	const thicknessTexture = loader.load( 'models/fbx/bunny_thickness.jpg' );
	imgTexture.wrapS = imgTexture.wrapT = THREE.RepeatWrapping;

	const material = new THREE.MeshSSSNodeMaterial();
	material.color = new THREE.Color( 1.0, 0.2, 0.2 );
	material.roughness = 0.3;
	material.thicknessColorNode = texture( thicknessTexture ).mul( vec3( 0.5, 0.3, 0.0 ) );
	material.thicknessDistortionNode = uniform( 0.1 );
	material.thicknessAmbientNode = uniform( 0.4 );
	material.thicknessAttenuationNode = uniform( 0.8 );
	material.thicknessPowerNode = uniform( 2.0 );
	material.thicknessScaleNode = uniform( 16.0 );

	// LOADER

	const loaderFBX = new FBXLoader();
	loaderFBX.load( 'models/fbx/stanford-bunny.fbx', function ( object ) {

		model = object.children[ 0 ];
		model.position.set( 0, 0, 10 );
		model.scale.setScalar( 1 );
		model.material = material;
		scene.add( model );

	} );

	initGUI( material );

}

function initGUI( material ) {

	const gui = new GUI( { title: 'Thickness Control' } );

	const ThicknessControls = function () {

		this.distortion = material.thicknessDistortionNode.value;
		this.ambient = material.thicknessAmbientNode.value;
		this.attenuation = material.thicknessAttenuationNode.value;
		this.power = material.thicknessPowerNode.value;
		this.scale = material.thicknessScaleNode.value;

	};

	const thicknessControls = new ThicknessControls();

	gui.add( thicknessControls, 'distortion' ).min( 0.01 ).max( 1 ).step( 0.01 ).onChange( function () {

		material.thicknessDistortionNode.value = thicknessControls.distortion;
		console.log( 'distortion' );

	} );

	gui.add( thicknessControls, 'ambient' ).min( 0.01 ).max( 5.0 ).step( 0.05 ).onChange( function () {

		material.thicknessAmbientNode.value = thicknessControls.ambient;

	} );

	gui.add( thicknessControls, 'attenuation' ).min( 0.01 ).max( 5.0 ).step( 0.05 ).onChange( function () {

		material.thicknessAttenuationNode.value = thicknessControls.attenuation;

	} );

	gui.add( thicknessControls, 'power' ).min( 0.01 ).max( 16.0 ).step( 0.1 ).onChange( function () {

		material.thicknessPowerNode.value = thicknessControls.power;

	} );

	gui.add( thicknessControls, 'scale' ).min( 0.01 ).max( 50.0 ).step( 0.1 ).onChange( function () {

		material.thicknessScaleNode.value = thicknessControls.scale;

	} );

}

function onWindowResize() {

	camera.aspect = window.innerWidth / window.innerHeight;
	camera.updateProjectionMatrix();

	renderer.setSize( window.innerWidth, window.innerHeight );

}

//

function animate() {

	render();

	stats.update();

}

function render() {

	if ( model ) model.rotation.y = performance.now() / 5000;

	renderer.render( scene, camera );

}
