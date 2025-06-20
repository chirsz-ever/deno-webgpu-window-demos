// https://github.com/mrdoob/three.js/blob/r175/examples/webgpu_tsl_angular_slicing.html

import * as THREE from 'three';
import { If, PI2, atan, color, frontFacing, output, positionLocal, Fn, uniform, vec4 } from 'three/tsl';

import { DRACOLoader } from 'three/addons/loaders/DRACOLoader.js';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { RGBELoader } from 'three/addons/loaders/RGBELoader.js';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { GUI } from 'three/addons/libs/lil-gui.module.min.js';

/* POLYFILL */
import * as polyfill from "../polyfill/polyfill.ts";
await polyfill.init("three.js webgpu - angular slicing");

let camera, scene, renderer, controls;

init();

function init() {

	camera = new THREE.PerspectiveCamera( 35, window.innerWidth / window.innerHeight, 0.1, 100 );
	camera.position.set( - 5, 5, 12 );

	scene = new THREE.Scene();

	const gui = new GUI();

	// environment

	const rgbeLoader = new RGBELoader();
	rgbeLoader.load( './textures/equirectangular/royal_esplanade_1k.hdr', ( environmentMap ) => {

		environmentMap.mapping = THREE.EquirectangularReflectionMapping;

		scene.background = environmentMap;
		scene.environment = environmentMap;

	} );

	// lights

	const directionalLight = new THREE.DirectionalLight( '#ffffff', 4 );
	directionalLight.position.set( 6.25, 3, 4 );
	directionalLight.castShadow = true;
	directionalLight.shadow.mapSize.set( 2048, 2048 );
	directionalLight.shadow.camera.near = 0.1;
	directionalLight.shadow.camera.far = 30;
	directionalLight.shadow.camera.top = 8;
	directionalLight.shadow.camera.right = 8;
	directionalLight.shadow.camera.bottom = - 8;
	directionalLight.shadow.camera.left = - 8;
	directionalLight.shadow.normalBias = 0.05;
	scene.add( directionalLight );

	// TSL functions

	const inAngle = Fn( ( [ position, angleStart, angleArc ] ) => {

		const angle = atan( position.y, position.x ).sub( angleStart ).mod( PI2 ).toVar();
		return angle.greaterThan( 0 ).and( angle.lessThan( angleArc ) );

	} );

	// materials

	const defaultMaterial = new THREE.MeshPhysicalNodeMaterial( {
		metalness: 0.5,
		roughness: 0.25,
		envMapIntensity: 0.5,
		color: '#858080'
	} );

	const slicedMaterial = new THREE.MeshPhysicalNodeMaterial( {
		metalness: 0.5,
		roughness: 0.25,
		envMapIntensity: 0.5,
		color: '#858080',
		side: THREE.DoubleSide
	} );

	// uniforms

	const sliceStart = uniform( 1.75 );
	const sliceArc = uniform( 1.25 );
	const sliceColor = uniform( color( '#b62f58' ) );

	// debug

	gui.add( sliceStart, 'value', - Math.PI, Math.PI, 0.001 ).name( 'sliceStart' );
	gui.add( sliceArc, 'value', 0, Math.PI * 2, 0.001 ).name( 'sliceArc' );
	gui.addColor( { color: sliceColor.value.getHexString( THREE.SRGBColorSpace ) }, 'color' ).onChange( value => sliceColor.value.set( value ) );

	// output

	slicedMaterial.outputNode = Fn( () => {

		// discard

		inAngle( positionLocal.xy, sliceStart, sliceArc ).discard();

		// backface color

		const finalOutput = output;
		If( frontFacing.not(), () => {

			finalOutput.assign( vec4( sliceColor, 1 ) );

		} );

		return finalOutput;

	} )();

	// shadow

	slicedMaterial.castShadowNode = Fn( () => {

		// discard

		inAngle( positionLocal.xy, sliceStart, sliceArc ).discard();

		return vec4( 0, 0, 0, 1 );

	} )();

	// model

	const dracoLoader = new DRACOLoader();
	dracoLoader.setDecoderPath( 'jsm/libs/draco/' );

	const gltfLoader = new GLTFLoader();
	gltfLoader.setDRACOLoader( dracoLoader );

	gltfLoader.load( './models/gltf/gears.glb', ( gltf ) => {

		const model = gltf.scene;

		model.traverse( ( child ) => {

			if ( child.isMesh ) {

				if ( child.name === 'outerHull' )
					child.material = slicedMaterial;
				else
					child.material = defaultMaterial;

				child.castShadow = true;
				child.receiveShadow = true;

			}

		} );

		scene.add( model );

	} );

	// plane

	const plane = new THREE.Mesh(
		new THREE.PlaneGeometry( 10, 10, 10 ),
		new THREE.MeshStandardMaterial( { color: '#aaaaaa' } )
	);
	plane.receiveShadow = true;
	plane.position.set( - 4, - 3, - 4 );
	plane.lookAt( new THREE.Vector3( 0, 0, 0 ) );
	scene.add( plane );

	// renderer

	renderer = new THREE.WebGPURenderer( { antialias: true } );
	renderer.toneMapping = THREE.ACESFilmicToneMapping;
	renderer.toneMappingExposure = 1;
	renderer.shadowMap.enabled = true;
	renderer.setPixelRatio( window.devicePixelRatio );
	renderer.setSize( window.innerWidth, window.innerHeight );
	renderer.setAnimationLoop( animate );
	document.body.appendChild( renderer.domElement );

	// controls

	controls = new OrbitControls( camera, renderer.domElement );
	controls.enableDamping = true;
	controls.minDistance = 0.1;
	controls.maxDistance = 50;

	window.addEventListener( 'resize', onWindowResize );

}

function onWindowResize() {

	camera.aspect = window.innerWidth / window.innerHeight;
	camera.updateProjectionMatrix();

	renderer.setSize( window.innerWidth, window.innerHeight );

}

async function animate() {

	controls.update();

	renderer.render( scene, camera );

}
