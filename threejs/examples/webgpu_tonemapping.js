// https://github.com/mrdoob/three.js/blob/r175/examples/webgpu_tonemapping.html

import * as THREE from 'three';

import { GUI } from 'three/addons/libs/lil-gui.module.min.js';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { RGBELoader } from 'three/addons/loaders/RGBELoader.js';

/* POLYFILL */
import * as polyfill from "../polyfill/polyfill.ts";
await polyfill.init("three.js webgpu - tone mapping");

let mesh, renderer, scene, camera, controls;
let gui, guiExposure = null;

const params = {
	exposure: 1.0,
	toneMapping: 'AgX',
	blurriness: 0.3,
	intensity: 1.0,
};

const toneMappingOptions = {
	None: THREE.NoToneMapping,
	Linear: THREE.LinearToneMapping,
	Reinhard: THREE.ReinhardToneMapping,
	Cineon: THREE.CineonToneMapping,
	ACESFilmic: THREE.ACESFilmicToneMapping,
	AgX: THREE.AgXToneMapping,
	Neutral: THREE.NeutralToneMapping
};

init().catch( function ( err ) {

	console.error( err );

} );

async function init() {

	renderer = new THREE.WebGPURenderer( { antialias: true } );
	renderer.setPixelRatio( window.devicePixelRatio );
	renderer.setSize( window.innerWidth, window.innerHeight );
	renderer.setAnimationLoop( animate );
	document.body.appendChild( renderer.domElement );

	renderer.toneMapping = toneMappingOptions[ params.toneMapping ];
	renderer.toneMappingExposure = params.exposure;

	scene = new THREE.Scene();
	scene.backgroundBlurriness = params.blurriness;

	camera = new THREE.PerspectiveCamera( 45, window.innerWidth / window.innerHeight, 0.25, 20 );
	camera.position.set( - 1.8, 0.6, 2.7 );

	controls = new OrbitControls( camera, renderer.domElement );
	controls.enableZoom = false;
	controls.enablePan = false;
	controls.target.set( 0, 0, - 0.2 );
	controls.update();

	const rgbeLoader = new RGBELoader()
		.setPath( 'textures/equirectangular/' );

	const gltfLoader = new GLTFLoader().setPath( 'models/gltf/DamagedHelmet/glTF/' );

	const [ texture, gltf ] = await Promise.all( [
		rgbeLoader.loadAsync( 'venice_sunset_1k.hdr' ),
		gltfLoader.loadAsync( 'DamagedHelmet.gltf' ),
	] );

	// environment

	texture.mapping = THREE.EquirectangularReflectionMapping;

	scene.background = texture;
	scene.environment = texture;

	// model

	mesh = gltf.scene.getObjectByName( 'node_damagedHelmet_-6514' );
	scene.add( mesh );

	window.addEventListener( 'resize', onWindowResize );

	gui = new GUI();
	const toneMappingFolder = gui.addFolder( 'Tone Mapping' );

	toneMappingFolder.add( params, 'toneMapping', Object.keys( toneMappingOptions ) )

		.name( 'type' )
		.onChange( function () {

			updateGUI( toneMappingFolder );

			renderer.toneMapping = toneMappingOptions[ params.toneMapping ];

		} );

	guiExposure = toneMappingFolder.add( params, 'exposure', 0, 2 )

		.onChange( function ( value ) {

			renderer.toneMappingExposure = value;

		} );

	const backgroundFolder = gui.addFolder( 'Background' );

	backgroundFolder.add( params, 'blurriness', 0, 1 )

		.onChange( function ( value ) {

			scene.backgroundBlurriness = value;

		} );

	backgroundFolder.add( params, 'intensity', 0, 1 )

		.onChange( function ( value ) {

			scene.backgroundIntensity = value;

		} );

	updateGUI( toneMappingFolder );

	gui.open();

}

function updateGUI( folder ) {

	if ( params.toneMapping === 'None' ) {

		guiExposure.hide();

	} else {

		guiExposure.show();

	}

}

function onWindowResize() {

	camera.aspect = window.innerWidth / window.innerHeight;

	camera.updateProjectionMatrix();

	renderer.setSize( window.innerWidth, window.innerHeight );

}

function animate() {

	renderer.render( scene, camera );

}
