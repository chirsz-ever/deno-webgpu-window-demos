// https://github.com/mrdoob/three.js/blob/r175/examples/webgpu_postprocessing_ssr.html
		import * as THREE from 'three';
		import { pass, mrt, output, transformedNormalView, metalness, blendColor, screenUV, color } from 'three/tsl';
		import { ssr } from 'three/addons/tsl/display/SSRNode.js';
		import { smaa } from 'three/addons/tsl/display/SMAANode.js';

		import { DRACOLoader } from 'three/addons/loaders/DRACOLoader.js';
		import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
		import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
		import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js';
		import { GUI } from 'three/addons/libs/lil-gui.module.min.js';
		import Stats from 'three/addons/libs/stats.module.js';

/* POLYFILL */
import * as polyfill from "../polyfill/polyfill.ts";
await polyfill.init("three.js webgpu - postprocessing - Screen Space Reflections (SSR)");

		const params = {
maxDistance: 0.5,
opacity: 1,
thickness: 0.015,
enabled: true
		};

		let camera, scene, renderer, postProcessing, ssrPass;
		let gui, stats, controls;

		init();

		async function init() {

camera = new THREE.PerspectiveCamera( 35, window.innerWidth / window.innerHeight, 0.1, 50 );
camera.position.set( 3, 2, 3 );

scene = new THREE.Scene();
scene.backgroundNode = screenUV.distance( .5 ).remap( 0, 0.5 ).mix( color( 0x888877 ), color( 0x776666 ) );

const dracoLoader = new DRACOLoader();
dracoLoader.setDecoderPath( 'jsm/libs/draco/' );
dracoLoader.setDecoderConfig( { type: 'js' } );
		
const loader = new GLTFLoader();
loader.setDRACOLoader( dracoLoader );
loader.load( 'models/gltf/steampunk_camera.glb', function ( gltf ) {

	gltf.scene.traverse( function ( object ) {

		if ( object.material ) {

			// Avoid overdrawing
			object.material.side = THREE.FrontSide;
		
		}
		
	} );
		
	gltf.scene.position.y = 0.1;
	scene.add( gltf.scene );

} );

//

renderer = new THREE.WebGPURenderer();
// renderer.setPixelRatio( window.devicePixelRatio );
renderer.setSize( window.innerWidth, window.innerHeight );
renderer.setAnimationLoop( animate );
renderer.toneMapping = THREE.ACESFilmicToneMapping;
document.body.appendChild( renderer.domElement );

await renderer.init();

const environment = new RoomEnvironment();
const pmremGenerator = new THREE.PMREMGenerator( renderer );

scene.environment = pmremGenerator.fromScene( environment ).texture;
scene.environmentIntensity = 1.25;
pmremGenerator.dispose();

//

postProcessing = new THREE.PostProcessing( renderer );

const scenePass = pass( scene, camera, { minFilter: THREE.NearestFilter, magFilter: THREE.NearestFilter } );
scenePass.setMRT( mrt( {
	output: output,
	normal: transformedNormalView,
	metalness: metalness
} ) );

const scenePassColor = scenePass.getTextureNode( 'output' );
const scenePassNormal = scenePass.getTextureNode( 'normal' );
const scenePassDepth = scenePass.getTextureNode( 'depth' );
const scenePassMetalness = scenePass.getTextureNode( 'metalness' );

ssrPass = ssr( scenePassColor, scenePassDepth, scenePassNormal, scenePassMetalness, camera );
ssrPass.resolutionScale = 1.0;

// blend SSR over beauty
		
const outputNode = smaa( blendColor( scenePassColor, ssrPass ) );

postProcessing.outputNode = outputNode;

//

controls = new OrbitControls( camera, renderer.domElement );
controls.enableDamping = true;
controls.update();

// stats

stats = new Stats();
document.body.appendChild( stats.dom );

window.addEventListener( 'resize', onWindowResize );

// GUI

gui = new GUI();
gui.add( params, 'maxDistance' ).min( 0 ).max( 1 ).onChange( updateParameters );
gui.add( params, 'opacity' ).min( 0 ).max( 1 ).onChange( updateParameters );
gui.add( params, 'thickness' ).min( 0 ).max( 0.05 ).onChange( updateParameters );
gui.add( params, 'enabled' ).onChange( () => {

	if ( params.enabled === true ) {

		postProcessing.outputNode = outputNode;

	} else {

		postProcessing.outputNode = scenePass;

	}

	postProcessing.needsUpdate = true;

} );
		
updateParameters();

		}

		function updateParameters() {

ssrPass.maxDistance.value = params.maxDistance;
ssrPass.opacity.value = params.opacity;
ssrPass.thickness.value = params.thickness;


		}

		function onWindowResize() {

camera.aspect = window.innerWidth / window.innerHeight;
camera.updateProjectionMatrix();

renderer.setSize( window.innerWidth, window.innerHeight );

		}

		function animate() {

stats.begin();

controls.update();

postProcessing.render();

stats.end();

		}
