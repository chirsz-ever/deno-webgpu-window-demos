// https://github.com/mrdoob/three.js/blob/r165/examples/webgpu_multiple_rendertargets.html

import * as THREE from 'three';

import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
//import { GUI } from 'three/addons/libs/lil-gui.module.min.js';

import { NodeMaterial, mix, modelNormalMatrix, normalGeometry, normalize, outputStruct, step, texture, uniform, uv, varying, vec2, vec4 } from 'three/nodes';
import WebGPU from 'three/addons/capabilities/WebGPU.js';
import WebGL from 'three/addons/capabilities/WebGL.js';

import WebGPURenderer from 'three/addons/renderers/webgpu/WebGPURenderer.js';

import QuadMesh from 'three/addons/objects/QuadMesh.js';

/* POLYFILL */
import * as polyfill from "./polyfill.ts";
await polyfill.init("three.js webgpu - Multiple Render Targets");

let camera, scene, renderer, torus;
let quadMesh, renderTarget;

/*

const parameters = {
	samples: 4,
	wireframe: false
};

const gui = new GUI();
gui.add( parameters, 'samples', 0, 4 ).step( 1 );
gui.add( parameters, 'wireframe' );

*/

class WriteGBufferMaterial extends NodeMaterial {

	constructor( diffuseTexture ) {

		super();

		this.lights = false;
		this.fog = false;
		this.colorSpaced = false;

		this.diffuseTexture = diffuseTexture;

		const vUv = varying( uv() );

		const transformedNormal = modelNormalMatrix.mul( normalGeometry );
		const vNormal = varying( normalize( transformedNormal ) );

		const repeat = uniform( vec2( 5, 0.5 ) );

		const gColor = texture( this.diffuseTexture, vUv.mul( repeat ) );
		const gNormal = vec4( normalize( vNormal ), 1.0 );

		this.fragmentNode = outputStruct( gColor, gNormal );

	}

}

class ReadGBufferMaterial extends NodeMaterial {

	constructor( tDiffuse, tNormal ) {

		super();

		this.lights = false;
		this.fog = false;

		const vUv = varying( uv() );

		const diffuse = texture( tDiffuse, vUv );
		const normal = texture( tNormal, vUv );

		this.fragmentNode = mix( diffuse, normal, step( 0.5, vUv.x ) );

	}

}

init();

function init() {

	if ( WebGPU.isAvailable() === false && WebGL.isWebGL2Available() === false ) {

		document.body.appendChild( WebGPU.getErrorMessage() );

		throw new Error( 'No WebGPU or WebGL2 support' );

	}

	renderer = new WebGPURenderer( { antialias: true } );
	renderer.setPixelRatio( window.devicePixelRatio );
	renderer.setSize( window.innerWidth, window.innerHeight );
	renderer.setAnimationLoop( render );
	document.body.appendChild( renderer.domElement );

	// Create a multi render target with Float buffers

	renderTarget = new THREE.RenderTarget(
		window.innerWidth * window.devicePixelRatio,
		window.innerHeight * window.devicePixelRatio,
		{ count: 2, minFilter: THREE.NearestFilter, magFilter: THREE.NearestFilter }
	);

	// Name our G-Buffer attachments for debugging

	renderTarget.textures[ 0 ].name = 'diffuse';
	renderTarget.textures[ 1 ].name = 'normal';

	// Scene setup

	scene = new THREE.Scene();
	scene.background = new THREE.Color( 0x222222 );

	camera = new THREE.PerspectiveCamera( 70, window.innerWidth / window.innerHeight, 0.1, 50 );
	camera.position.z = 4;

	const loader = new THREE.TextureLoader();

	const diffuse = loader.load( 'textures/hardwood2_diffuse.jpg' );
	diffuse.colorSpace = THREE.SRGBColorSpace;
	diffuse.wrapS = THREE.RepeatWrapping;
	diffuse.wrapT = THREE.RepeatWrapping;

	torus = new THREE.Mesh(
		new THREE.TorusKnotGeometry( 1, 0.3, 128, 32 ),
		new WriteGBufferMaterial( diffuse )
	);

	scene.add( torus );

	// PostProcessing setup

	quadMesh = new QuadMesh( new ReadGBufferMaterial( renderTarget.textures[ 0 ], renderTarget.textures[ 1 ] ) );

	// Controls

	new OrbitControls( camera, renderer.domElement );

	window.addEventListener( 'resize', onWindowResize );

}

function onWindowResize() {

	camera.aspect = window.innerWidth / window.innerHeight;
	camera.updateProjectionMatrix();

	renderer.setSize( window.innerWidth, window.innerHeight );

	const dpr = renderer.getPixelRatio();
	renderTarget.setSize( window.innerWidth * dpr, window.innerHeight * dpr );

}

function render( time ) {

	/*

	// Feature not yet working

	renderTarget.samples = parameters.samples;

	scene.traverse( function ( child ) {

		if ( child.material !== undefined ) {

			child.material.wireframe = parameters.wireframe;

		}

	} );

	*/

	torus.rotation.y = ( time / 1000 ) * .4;

	// render scene into target
	renderer.setRenderTarget( renderTarget );
	renderer.render( scene, camera );

	// render post FX
	renderer.setRenderTarget( null );
	quadMesh.render( renderer );

}
