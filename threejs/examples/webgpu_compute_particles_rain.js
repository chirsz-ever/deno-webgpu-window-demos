// https://github.com/mrdoob/three.js/blob/r175/examples/webgpu_compute_particles_rain.html

import * as THREE from 'three';
import { Fn, texture, uv, uint, instancedArray, positionWorld, billboarding, time, hash, deltaTime, vec2, instanceIndex, positionGeometry, If } from 'three/tsl';

import { OrbitControls } from 'three/addons/controls/OrbitControls.js';

import Stats from 'three/addons/libs/stats.module.js';

import { GUI } from 'three/addons/libs/lil-gui.module.min.js';

import * as BufferGeometryUtils from 'three/addons/utils/BufferGeometryUtils.js';

/* POLYFILL */
import * as polyfill from "../polyfill/polyfill.ts";
await polyfill.init("three.js - WebGPU - Compute Particles Rain");

const maxParticleCount = 50000;
const instanceCount = maxParticleCount / 2;

let camera, scene, renderer;
let controls, stats;
let computeParticles;
let monkey;
let clock;

let collisionBox, collisionCamera, collisionPosRT, collisionPosMaterial;
let collisionBoxPos, collisionBoxPosUI;

init();

function init() {

	const { innerWidth, innerHeight } = window;

	camera = new THREE.PerspectiveCamera( 60, innerWidth / innerHeight, .1, 110 );
	camera.position.set( 40, 8, 0 );
	camera.lookAt( 0, 0, 0 );

	scene = new THREE.Scene();

	const dirLight = new THREE.DirectionalLight( 0xffffff, .5 );
	dirLight.castShadow = true;
	dirLight.position.set( 3, 17, 17 );
	dirLight.castShadow = true;
	dirLight.shadow.camera.near = 1;
	dirLight.shadow.camera.far = 50;
	dirLight.shadow.camera.right = 25;
	dirLight.shadow.camera.left = - 25;
	dirLight.shadow.camera.top = 25;
	dirLight.shadow.camera.bottom = - 25;
	dirLight.shadow.mapSize.width = 2048;
	dirLight.shadow.mapSize.height = 2048;
	dirLight.shadow.bias = - 0.01;

	scene.add( dirLight );
	scene.add( new THREE.AmbientLight( 0x111111 ) );

	//

	collisionCamera = new THREE.OrthographicCamera( - 50, 50, 50, - 50, .1, 50 );
	collisionCamera.position.y = 50;
	collisionCamera.lookAt( 0, 0, 0 );
	collisionCamera.layers.disableAll();
	collisionCamera.layers.enable( 1 );

	collisionPosRT = new THREE.RenderTarget( 1024, 1024 );
	collisionPosRT.texture.type = THREE.HalfFloatType;
	collisionPosRT.texture.magFilter = THREE.NearestFilter;
	collisionPosRT.texture.minFilter = THREE.NearestFilter;
	collisionPosRT.texture.generateMipmaps = false;

	collisionPosMaterial = new THREE.MeshBasicNodeMaterial();
	collisionPosMaterial.colorNode = positionWorld;

	//

	const positionBuffer = instancedArray( maxParticleCount, 'vec3' );
	const velocityBuffer = instancedArray( maxParticleCount, 'vec3' );
	const ripplePositionBuffer = instancedArray( maxParticleCount, 'vec3' );
	const rippleTimeBuffer = instancedArray( maxParticleCount, 'vec3' );

	// compute

	const randUint = () => uint( Math.random() * 0xFFFFFF );

	const computeInit = Fn( () => {

		const position = positionBuffer.element( instanceIndex );
		const velocity = velocityBuffer.element( instanceIndex );
		const rippleTime = rippleTimeBuffer.element( instanceIndex );

		const randX = hash( instanceIndex );
		const randY = hash( instanceIndex.add( randUint() ) );
		const randZ = hash( instanceIndex.add( randUint() ) );

		position.x = randX.mul( 100 ).add( - 50 );
		position.y = randY.mul( 25 );
		position.z = randZ.mul( 100 ).add( - 50 );

		velocity.y = randX.mul( - .04 ).add( - .2 );

		rippleTime.x = 1000;

	} )().compute( maxParticleCount );

	//

	const computeUpdate = Fn( () => {

		const getCoord = ( pos ) => pos.add( 50 ).div( 100 );

		const position = positionBuffer.element( instanceIndex );
		const velocity = velocityBuffer.element( instanceIndex );
		const ripplePosition = ripplePositionBuffer.element( instanceIndex );
		const rippleTime = rippleTimeBuffer.element( instanceIndex );

		position.addAssign( velocity );

		rippleTime.x = rippleTime.x.add( deltaTime.mul( 4 ) );

		//

		const collisionArea = texture( collisionPosRT.texture, getCoord( position.xz ) );

		const surfaceOffset = .05;

		const floorPosition = collisionArea.y.add( surfaceOffset );

		// floor

		const ripplePivotOffsetY = - .9;

		If( position.y.add( ripplePivotOffsetY ).lessThan( floorPosition ), () => {

			position.y = 25;

			ripplePosition.xz = position.xz;
			ripplePosition.y = floorPosition;

			// reset hit time: x = time

			rippleTime.x = 1;

			// next drops will not fall in the same place

			position.x = hash( instanceIndex.add( time ) ).mul( 100 ).add( - 50 );
			position.z = hash( instanceIndex.add( time.add( randUint() ) ) ).mul( 100 ).add( - 50 );

		} );

		const rippleOnSurface = texture( collisionPosRT.texture, getCoord( ripplePosition.xz ) );

		const rippleFloorArea = rippleOnSurface.y.add( surfaceOffset );

		If( ripplePosition.y.greaterThan( rippleFloorArea ), () => {

			rippleTime.x = 1000;

		} );

	} );

	computeParticles = computeUpdate().compute( maxParticleCount );

	// rain

	const rainMaterial = new THREE.MeshBasicNodeMaterial();
	rainMaterial.colorNode = uv().distance( vec2( .5, 0 ) ).oneMinus().mul( 3 ).exp().mul( .1 );
	rainMaterial.vertexNode = billboarding( { position: positionBuffer.toAttribute() } );
	rainMaterial.opacity = .2;
	rainMaterial.side = THREE.DoubleSide;
	rainMaterial.forceSinglePass = true;
	rainMaterial.depthWrite = false;
	rainMaterial.depthTest = true;
	rainMaterial.transparent = true;

	const rainParticles = new THREE.Mesh( new THREE.PlaneGeometry( .1, 2 ), rainMaterial );
	rainParticles.count = instanceCount;
	scene.add( rainParticles );

	// ripple

	const rippleTime = rippleTimeBuffer.element( instanceIndex ).x;

	const rippleEffect = Fn( () => {

		const center = uv().add( vec2( - .5 ) ).length().mul( 7 );
		const distance = rippleTime.sub( center );

		return distance.min( 1 ).sub( distance.max( 1 ).sub( 1 ) );

	} );

	const rippleMaterial = new THREE.MeshBasicNodeMaterial();
	rippleMaterial.colorNode = rippleEffect();
	rippleMaterial.positionNode = positionGeometry.add( ripplePositionBuffer.toAttribute() );
	rippleMaterial.opacityNode = rippleTime.mul( .3 ).oneMinus().max( 0 ).mul( .5 );
	rippleMaterial.side = THREE.DoubleSide;
	rippleMaterial.forceSinglePass = true;
	rippleMaterial.depthWrite = false;
	rippleMaterial.depthTest = true;
	rippleMaterial.transparent = true;

	// ripple geometry

	const surfaceRippleGeometry = new THREE.PlaneGeometry( 2.5, 2.5 );
	surfaceRippleGeometry.rotateX( - Math.PI / 2 );

	const xRippleGeometry = new THREE.PlaneGeometry( 1, 2 );
	xRippleGeometry.rotateY( - Math.PI / 2 );

	const zRippleGeometry = new THREE.PlaneGeometry( 1, 2 );

	const rippleGeometry = BufferGeometryUtils.mergeGeometries( [ surfaceRippleGeometry, xRippleGeometry, zRippleGeometry ] );

	const rippleParticles = new THREE.Mesh( rippleGeometry, rippleMaterial );
	rippleParticles.count = instanceCount;
	scene.add( rippleParticles );

	// floor geometry

	const floorGeometry = new THREE.PlaneGeometry( 1000, 1000 );
	floorGeometry.rotateX( - Math.PI / 2 );

	const plane = new THREE.Mesh( floorGeometry, new THREE.MeshBasicMaterial( { color: 0x050505 } ) );
	scene.add( plane );

	//

	collisionBox = new THREE.Mesh( new THREE.BoxGeometry( 30, 1, 15 ), new THREE.MeshStandardMaterial() );
	collisionBox.material.color.set( 0x333333 );
	collisionBox.position.y = 12;
	collisionBox.scale.x = 3.5;
	collisionBox.layers.enable( 1 );
	collisionBox.castShadow = true;
	scene.add( collisionBox );

	//

	const loader = new THREE.BufferGeometryLoader();
	loader.load( 'models/json/suzanne_buffergeometry.json', function ( geometry ) {

		geometry.computeVertexNormals();

		monkey = new THREE.Mesh( geometry, new THREE.MeshStandardMaterial( { roughness: 1, metalness: 0 } ) );
		monkey.receiveShadow = true;
		monkey.scale.setScalar( 5 );
		monkey.rotation.y = Math.PI / 2;
		monkey.position.y = 4.5;
		monkey.layers.enable( 1 ); // add to collision layer

		scene.add( monkey );

	} );

	//

	clock = new THREE.Clock();

	//

	renderer = new THREE.WebGPURenderer( { antialias: true } );
	renderer.setPixelRatio( window.devicePixelRatio );
	renderer.setSize( window.innerWidth, window.innerHeight );
	renderer.setAnimationLoop( animate );
	document.body.appendChild( renderer.domElement );
	stats = new Stats();
	document.body.appendChild( stats.dom );

	//

	renderer.computeAsync( computeInit );

	//

	controls = new OrbitControls( camera, renderer.domElement );
	controls.minDistance = 5;
	controls.maxDistance = 50;
	controls.update();

	//

	window.addEventListener( 'resize', onWindowResize );

	// gui

	const gui = new GUI();

	// use lerp to smooth the movement
	collisionBoxPosUI = new THREE.Vector3().copy( collisionBox.position );
	collisionBoxPos = new THREE.Vector3();

	gui.add( collisionBoxPosUI, 'z', - 50, 50, .001 ).name( 'position' );
	gui.add( collisionBox.scale, 'x', .1, 3.5, 0.01 ).name( 'scale' );
	gui.add( rainParticles, 'count', 200, maxParticleCount, 1 ).name( 'drop count' ).onChange( ( v ) => rippleParticles.count = v );

}

function onWindowResize() {

	const { innerWidth, innerHeight } = window;

	camera.aspect = innerWidth / innerHeight;
	camera.updateProjectionMatrix();

	renderer.setSize( innerWidth, innerHeight );

}

function animate() {

	stats.update();

	const delta = clock.getDelta();

	if ( monkey ) {

		monkey.rotation.y += delta;

	}

	collisionBoxPos.set( collisionBoxPosUI.x, collisionBoxPosUI.y, - collisionBoxPosUI.z );

	collisionBox.position.lerp( collisionBoxPos, 10 * delta );

	// position

	scene.overrideMaterial = collisionPosMaterial;
	renderer.setRenderTarget( collisionPosRT );
	renderer.render( scene, collisionCamera );

	// compute

	renderer.compute( computeParticles );

	// result

	scene.overrideMaterial = null;
	renderer.setRenderTarget( null );
	renderer.render( scene, camera );

}
