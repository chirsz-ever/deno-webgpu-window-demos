// https://github.com/mrdoob/three.js/blob/r175/examples/webgpu_morphtargets_face.html

import * as THREE from 'three';

import Stats from 'three/addons/libs/stats.module.js';

import { OrbitControls } from 'three/addons/controls/OrbitControls.js';

import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { KTX2Loader } from 'three/addons/loaders/KTX2Loader.js';
import { MeshoptDecoder } from 'three/addons/libs/meshopt_decoder.module.js';

import { GUI } from 'three/addons/libs/lil-gui.module.min.js';

/* POLYFILL */
import * as polyfill from "../polyfill/polyfill.ts";
await polyfill.init("three.js webgpu - morph face targets");

init();

async function init() {

	let mixer;

	const clock = new THREE.Clock();


	const camera = new THREE.PerspectiveCamera( 45, window.innerWidth / window.innerHeight, 1, 20 );
	camera.position.set( - 1.8, 0.8, 3 );

	const scene = new THREE.Scene();

	const renderer = new THREE.WebGPURenderer( { antialias: true } );
	renderer.setPixelRatio( window.devicePixelRatio );
	renderer.setSize( window.innerWidth, window.innerHeight );
	renderer.setAnimationLoop( animate );
	renderer.toneMapping = THREE.ACESFilmicToneMapping;
	document.body.appendChild( renderer.domElement );

	await renderer.init();

	const environment = new RoomEnvironment();
	const pmremGenerator = new THREE.PMREMGenerator( renderer );

	scene.background = new THREE.Color( 0x666666 );
	scene.environment = pmremGenerator.fromScene( environment ).texture;

	const ktx2Loader = await new KTX2Loader()
		.setTranscoderPath( 'jsm/libs/basis/' )
		.detectSupportAsync( renderer );

	new GLTFLoader()
		.setKTX2Loader( ktx2Loader )
		.setMeshoptDecoder( MeshoptDecoder )
		.load( 'models/gltf/facecap.glb', ( gltf ) => {

			const mesh = gltf.scene.children[ 0 ];

			scene.add( mesh );

			mixer = new THREE.AnimationMixer( mesh );

			mixer.clipAction( gltf.animations[ 0 ] ).play();

			// GUI

			const head = mesh.getObjectByName( 'mesh_2' );
			const influences = head.morphTargetInfluences;

			const gui = new GUI();
			gui.close();

			for ( const [ key, value ] of Object.entries( head.morphTargetDictionary ) ) {

				gui.add( influences, value, 0, 1, 0.01 )
					.name( key.replace( 'blendShape1.', '' ) )
					.listen();

			}

		} );

	scene.background = new THREE.Color( 0x666666 );

	const controls = new OrbitControls( camera, renderer.domElement );
	controls.enableDamping = true;
	controls.minDistance = 2.5;
	controls.maxDistance = 5;
	controls.minAzimuthAngle = - Math.PI / 2;
	controls.maxAzimuthAngle = Math.PI / 2;
	controls.maxPolarAngle = Math.PI / 1.8;
	controls.target.set( 0, 0.15, - 0.2 );

	const stats = new Stats();
	document.body.appendChild( stats.dom );



	function animate() {

		const delta = clock.getDelta();

		if ( mixer ) {

			mixer.update( delta );

		}

		renderer.render( scene, camera );

		controls.update();

		stats.update();

	}

	window.addEventListener( 'resize', () => {

		camera.aspect = window.innerWidth / window.innerHeight;
		camera.updateProjectionMatrix();

		renderer.setSize( window.innerWidth, window.innerHeight );

	} );

}
