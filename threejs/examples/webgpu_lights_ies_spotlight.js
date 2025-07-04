// https://github.com/mrdoob/three.js/blob/r175/examples/webgpu_lights_ies_spotlight.html

import * as THREE from 'three';

/* POLYFILL */
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';

import { IESLoader } from 'three/addons/loaders/IESLoader.js';

import { GUI } from 'three/addons/libs/lil-gui.module.min.js';

/* POLYFILL */
import * as polyfill from "../polyfill/polyfill.ts";
await polyfill.init("three.js webgpu - ies spotlight");

let renderer, scene, camera;
let lights;

async function init() {

	const iesLoader = new IESLoader().setPath( './ies/' );
	//iesLoader.type = THREE.UnsignedByteType; // LDR

	const [ iesTexture1, iesTexture2, iesTexture3, iesTexture4 ] = await Promise.all( [
		iesLoader.loadAsync( '007cfb11e343e2f42e3b476be4ab684e.ies' ),
		iesLoader.loadAsync( '06b4cfdc8805709e767b5e2e904be8ad.ies' ),
		iesLoader.loadAsync( '02a7562c650498ebb301153dbbf59207.ies' ),
		iesLoader.loadAsync( '1a936937a49c63374e6d4fbed9252b29.ies' )
	] );

	//

	scene = new THREE.Scene();

	//

	const spotLight = new THREE.IESSpotLight( 0xff0000, 500 );
	spotLight.position.set( 6.5, 3, 6.5 );
	spotLight.angle = Math.PI / 8;
	spotLight.penumbra = 0.7;
	spotLight.distance = 20;
	spotLight.castShadow = true;
	spotLight.iesMap = iesTexture1;
	spotLight.userData.helper = new THREE.SpotLightHelper( spotLight );
	scene.add( spotLight );
	scene.add( spotLight.target );
	scene.add( spotLight.userData.helper );

	//

	const spotLight2 = new THREE.IESSpotLight( 0x00ff00, 500 );
	spotLight2.position.set( - 6.5, 3, 6.5 );
	spotLight2.angle = Math.PI / 8;
	spotLight2.penumbra = 0.7;
	spotLight2.distance = 20;
	spotLight2.castShadow = true;
	spotLight2.iesMap = iesTexture2;
	spotLight2.userData.helper = new THREE.SpotLightHelper( spotLight2 );
	scene.add( spotLight2 );
	scene.add( spotLight2.target );
	scene.add( spotLight2.userData.helper );

	//

	const spotLight3 = new THREE.IESSpotLight( 0x0000ff, 500 );
	spotLight3.position.set( - 6.5, 3, - 6.5 );
	spotLight3.angle = Math.PI / 8;
	spotLight3.penumbra = 0.7;
	spotLight3.distance = 20;
	spotLight3.castShadow = true;
	spotLight3.iesMap = iesTexture3;
	spotLight3.userData.helper = new THREE.SpotLightHelper( spotLight3 );
	scene.add( spotLight3 );
	scene.add( spotLight3.target );
	scene.add( spotLight3.userData.helper );

	//

	const spotLight4 = new THREE.IESSpotLight( 0xffffff, 500 );
	spotLight4.position.set( 6.5, 3, - 6.5 );
	spotLight4.angle = Math.PI / 8;
	spotLight4.penumbra = 0.7;
	spotLight4.distance = 20;
	spotLight4.castShadow = true;
	spotLight4.iesMap = iesTexture4;
	spotLight4.userData.helper = new THREE.SpotLightHelper( spotLight4 );
	scene.add( spotLight4 );
	scene.add( spotLight4.target );
	scene.add( spotLight4.userData.helper );

	//

	lights = [ spotLight, spotLight2, spotLight3, spotLight4 ];

	//

	const material = new THREE.MeshPhongMaterial( { color: 0x999999/*, dithering: true*/ } );

	const geometry = new THREE.PlaneGeometry( 200, 200 );

	const mesh = new THREE.Mesh( geometry, material );
	mesh.rotation.x = - Math.PI * 0.5;
	mesh.receiveShadow = true;
	scene.add( mesh );

	const geometry2 = new THREE.BoxGeometry( 2, 2, 2 );
	//const geometry2 = new THREE.IcosahedronGeometry( 1, 5 );

	const mesh2 = new THREE.Mesh( geometry2, material );
	mesh2.position.y = 1;
	mesh2.castShadow = true;
	scene.add( mesh2 );

	//

	renderer = new THREE.WebGPURenderer( { antialias: true } );
	renderer.setPixelRatio( window.devicePixelRatio );
	renderer.setSize( window.innerWidth, window.innerHeight );
	renderer.setAnimationLoop( render );
	renderer.shadowMap.enabled = true;
	document.body.appendChild( renderer.domElement );

	camera = new THREE.PerspectiveCamera( 35, window.innerWidth / window.innerHeight, .1, 100 );
	camera.position.set( 16, 4, 1 );

	const controls = new OrbitControls( camera, renderer.domElement );
	controls.minDistance = 2;
	controls.maxDistance = 50;
	controls.enablePan = false;

	//

	function setHelperVisible( value ) {

		for ( let i = 0; i < lights.length; i ++ ) {

			lights[ i ].userData.helper.visible = value;

		}

	}

	setHelperVisible( false );

	//

	const gui = new GUI();

	gui.add( { helper: false }, 'helper' ).onChange( ( v ) => setHelperVisible( v ) );

	gui.open();

	//

	window.addEventListener( 'resize', onWindowResize );

}

function onWindowResize() {

	camera.aspect = window.innerWidth / window.innerHeight;
	camera.updateProjectionMatrix();

	renderer.setSize( window.innerWidth, window.innerHeight );

}

function render( time ) {

	time = time / 1000;

	for ( let i = 0; i < lights.length; i ++ ) {

		const t = ( Math.sin( ( time + i ) * ( Math.PI / 2 ) ) + 1 ) / 2;

		const x = THREE.MathUtils.lerp( lights[ i ].position.x, 0, t );
		const z = THREE.MathUtils.lerp( lights[ i ].position.z, 0, t );

		lights[ i ].target.position.x = x;
		lights[ i ].target.position.z = z;
		if ( lights[ i ].userData.helper ) lights[ i ].userData.helper.update();

	}

	renderer.render( scene, camera );

}

init();
