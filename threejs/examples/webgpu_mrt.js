// https://github.com/mrdoob/three.js/blob/r175/examples/webgpu_mrt.html

import * as THREE from 'three';
import { output, transformedNormalView, pass, step, diffuseColor, emissive, directionToColor, screenUV, mix, mrt, Fn } from 'three/tsl';

import { RGBELoader } from 'three/addons/loaders/RGBELoader.js';

import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';

/* POLYFILL */
import * as polyfill from "../polyfill/polyfill.ts";
await polyfill.init("three.js webgpu - mrt");

let camera, scene, renderer;
let postProcessing;

init();

function init() {

	const container = document.createElement( 'div' );
	document.body.appendChild( container );

	// scene

	camera = new THREE.PerspectiveCamera( 45, window.innerWidth / window.innerHeight, 0.25, 20 );
	camera.position.set( - 1.8, 0.6, 2.7 );

	scene = new THREE.Scene();

	new RGBELoader()
		.setPath( 'textures/equirectangular/' )
		.load( 'royal_esplanade_1k.hdr', function ( texture ) {

			texture.mapping = THREE.EquirectangularReflectionMapping;

			scene.background = texture;
			scene.environment = texture;

			// model

			const loader = new GLTFLoader().setPath( 'models/gltf/DamagedHelmet/glTF/' );
			loader.load( 'DamagedHelmet.gltf', function ( gltf ) {

				scene.add( gltf.scene );

			} );

		} );

	// renderer

	renderer = new THREE.WebGPURenderer( { antialias: true } );
	renderer.setPixelRatio( window.devicePixelRatio );
	renderer.setSize( window.innerWidth, window.innerHeight );
	renderer.setAnimationLoop( render );
	renderer.toneMapping = THREE.ACESFilmicToneMapping;
	container.appendChild( renderer.domElement );

	// post processing

	const scenePass = pass( scene, camera, { minFilter: THREE.NearestFilter, magFilter: THREE.NearestFilter } );
	scenePass.setMRT( mrt( {
		output: output,
		normal: directionToColor( transformedNormalView ),
		diffuse: diffuseColor,
		emissive: emissive
	} ) );

	// optimize textures

	const normalTexture = scenePass.getTexture( 'normal' );
	const diffuseTexture = scenePass.getTexture( 'diffuse' );
	const emissiveTexture = scenePass.getTexture( 'emissive' );

	normalTexture.type = diffuseTexture.type = emissiveTexture.type = THREE.UnsignedByteType;

	// post processing - mrt

	postProcessing = new THREE.PostProcessing( renderer );
	postProcessing.outputColorTransform = false;
	postProcessing.outputNode = Fn( () => {

		const output = scenePass.getTextureNode( 'output' ); // output name is optional here
		const normal = scenePass.getTextureNode( 'normal' );
		const diffuse = scenePass.getTextureNode( 'diffuse' );
		const emissive = scenePass.getTextureNode( 'emissive' );

		const out = mix( output.renderOutput(), output, step( 0.2, screenUV.x ) );
		const nor = mix( out, normal, step( 0.4, screenUV.x ) );
		const emi = mix( nor, emissive, step( 0.6, screenUV.x ) );
		const dif = mix( emi, diffuse, step( 0.8, screenUV.x ) );

		return dif;

	} )();

	// controls

	const controls = new OrbitControls( camera, renderer.domElement );
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

}

//

function render() {

	postProcessing.render();

}
