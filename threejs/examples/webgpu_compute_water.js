// https://github.com/mrdoob/three.js/blob/r175/examples/webgpu_compute_water.html

import * as THREE from 'three';

import { color, instanceIndex, struct, If, varyingProperty, uint, int, negate, floor, float, length, clamp, vec2, cos, vec3, vertexIndex, Fn, uniform, instancedArray, min, max, positionLocal, transformNormalToView } from 'three/tsl';
import { SimplexNoise } from 'three/addons/math/SimplexNoise.js';
import { GUI } from 'three/addons/libs/lil-gui.module.min.js';
import Stats from 'three/addons/libs/stats.module.js';

// Dimensions of simulation grid.
/* POLYFILL */
import * as polyfill from "../polyfill/polyfill.ts";
await polyfill.init("three.js webgpu - compute - water");

const WIDTH = 128;

// Water size in system units.
const BOUNDS = 512;
const BOUNDS_HALF = BOUNDS * 0.5;

const waterMaxHeight = 10;

let container, stats;
let camera, scene, renderer;
let mouseMoved = false;
const mouseCoords = new THREE.Vector2();
const raycaster = new THREE.Raycaster();
let effectController;

let waterMesh, meshRay;
let computeHeight, computeSmooth, computeSphere;

const NUM_SPHERES = 100;

const simplex = new SimplexNoise();

init();

function noise( x, y ) {

	let multR = waterMaxHeight;
	let mult = 0.025;
	let r = 0;
	for ( let i = 0; i < 15; i ++ ) {

		r += multR * simplex.noise( x * mult, y * mult );
		multR *= 0.53 + 0.025 * i;
		mult *= 1.25;

	}

	return r;

}

function init() {

	container = document.createElement( 'div' );
	document.body.appendChild( container );

	camera = new THREE.PerspectiveCamera( 75, window.innerWidth / window.innerHeight, 1, 3000 );
	camera.position.set( 0, 200, 350 );
	camera.lookAt( 0, 0, 0 );

	scene = new THREE.Scene();

	const sun = new THREE.DirectionalLight( 0xFFFFFF, 3.0 );
	sun.position.set( 300, 400, 175 );
	scene.add( sun );

	const sun2 = new THREE.DirectionalLight( 0x40A040, 2.0 );
	sun2.position.set( - 100, 350, - 200 );
	scene.add( sun2 );

	//

	effectController = {
		mousePos: uniform( new THREE.Vector2( 10000, 10000 ) ).label( 'mousePos' ),
		mouseSize: uniform( 30.0 ).label( 'mouseSize' ),
		viscosity: uniform( 0.95 ).label( 'viscosity' ),
		spheresEnabled: true,
		wireframe: false
	};

	// Initialize height storage buffers
	const heightArray = new Float32Array( WIDTH * WIDTH );
	const prevHeightArray = new Float32Array( WIDTH * WIDTH );

	let p = 0;
	for ( let j = 0; j < WIDTH; j ++ ) {

		for ( let i = 0; i < WIDTH; i ++ ) {

			const x = i * 128 / WIDTH;
			const y = j * 128 / WIDTH;

			const height = noise( x, y );

			heightArray[ p ] = height;
			prevHeightArray[ p ] = height;

			p ++;

		}

	}

	const heightStorage = instancedArray( heightArray ).label( 'Height' );
	const prevHeightStorage = instancedArray( prevHeightArray ).label( 'PrevHeight' );

	// Get Indices of Neighbor Values of an Index in the Simulation Grid
	const getNeighborIndicesTSL = ( index ) => {

		const width = uint( WIDTH );

		// Get 2-D compute coordinate from one-dimensional instanceIndex. The calculation will
		// still work even if you dispatch your compute shader 2-dimensionally, since within a compute
		// context, instanceIndex is a 1-dimensional value derived from the workgroup dimensions.

		// Cast to int to prevent unintended index overflow upon subtraction.
		const x = int( index.mod( WIDTH ) );
		const y = int( index.div( WIDTH ) );

		// The original shader accesses height via texture uvs. However, unlike with textures, we can't
		// access areas that are out of bounds. Accordingly, we emulate the Clamp to Edge Wrapping
		// behavior of accessing a DataTexture with out of bounds uvs.

		const leftX = max( 0, x.sub( 1 ) );
		const rightX = min( x.add( 1 ), width.sub( 1 ) );

		const bottomY = max( 0, y.sub( 1 ) );
		const topY = min( y.add( 1 ), width.sub( 1 ) );

		const westIndex = y.mul( width ).add( leftX );
		const eastIndex = y.mul( width ).add( rightX );

		const southIndex = bottomY.mul( width ).add( x );
		const northIndex = topY.mul( width ).add( x );

		return { northIndex, southIndex, eastIndex, westIndex };

	};

	// Get simulation index neighbor values
	const getNeighborValuesTSL = ( index, store ) => {

		const { northIndex, southIndex, eastIndex, westIndex } = getNeighborIndicesTSL( index );

		const north = store.element( northIndex );
		const south = store.element( southIndex );
		const east = store.element( eastIndex );
		const west = store.element( westIndex );

		return { north, south, east, west };

	};

	// Get new normals of simulation area.
	const getNormalsFromHeightTSL = ( index, store ) => {

		const { north, south, east, west } = getNeighborValuesTSL( index, store );

		const normalX = ( west.sub( east ) ).mul( WIDTH / BOUNDS );
		const normalY = ( south.sub( north ) ).mul( WIDTH / BOUNDS );

		return { normalX, normalY };

	};

	computeHeight = Fn( () => {

		const { viscosity, mousePos, mouseSize } = effectController;

		const height = heightStorage.element( instanceIndex ).toVar();
		const prevHeight = prevHeightStorage.element( instanceIndex ).toVar();

		const { north, south, east, west } = getNeighborValuesTSL( instanceIndex, heightStorage );

		const neighborHeight = north.add( south ).add( east ).add( west );
		neighborHeight.mulAssign( 0.5 );
		neighborHeight.subAssign( prevHeight );

		const newHeight = neighborHeight.mul( viscosity );

		// Get 2-D compute coordinate from one-dimensional instanceIndex.
		const x = float( instanceIndex.mod( WIDTH ) ).mul( 1 / WIDTH );
		const y = float( instanceIndex.div( WIDTH ) ).mul( 1 / WIDTH );

		// Mouse influence
		const centerVec = vec2( 0.5 );
		// Get length of position in range [ -BOUNDS / 2, BOUNDS / 2 ], offset by mousePos, then scale.
		const mousePhase = clamp( length( ( vec2( x, y ).sub( centerVec ) ).mul( BOUNDS ).sub( mousePos ) ).mul( Math.PI ).div( mouseSize ), 0.0, Math.PI );

		newHeight.addAssign( cos( mousePhase ).add( 1.0 ).mul( 0.28 ) );

		prevHeightStorage.element( instanceIndex ).assign( height );
		heightStorage.element( instanceIndex ).assign( newHeight );

	} )().compute( WIDTH * WIDTH );

	computeSmooth = Fn( () => {

		const height = heightStorage.element( instanceIndex ).toVar();
		const prevHeight = prevHeightStorage.element( instanceIndex ).toVar();

		// Get neighboring height values.
		const { north: northH, south: southH, east: eastH, west: westH } = getNeighborValuesTSL( instanceIndex, heightStorage );

		// Get neighboring prev height values.
		const { north: northP, south: southP, east: eastP, west: westP } = getNeighborValuesTSL( instanceIndex, prevHeightStorage );

		height.addAssign( northH.add( southH ).add( eastH ).add( westH ) );
		prevHeight.addAssign( northP.add( southP ).add( eastP ).add( westP ) );

		heightStorage.element( instanceIndex ).assign( height.div( 5 ) );
		prevHeightStorage.element( instanceIndex ).assign( height.div( 5 ) );

	} )().compute( WIDTH * WIDTH/*, [ 8, 8 ]*/ );

	// Water Geometry corresponds with buffered compute grid.
	const waterGeometry = new THREE.PlaneGeometry( BOUNDS, BOUNDS, WIDTH - 1, WIDTH - 1 );
	// material: make a THREE.ShaderMaterial clone of THREE.MeshPhongMaterial, with customized position shader.
	const waterMaterial = new THREE.MeshPhongNodeMaterial();

	waterMaterial.lights = true;
	waterMaterial.colorNode = color( 0x0040C0 );
	waterMaterial.specularNode = color( 0x111111 );
	waterMaterial.shininess = Math.max( 50, 1e-4 );
	waterMaterial.positionNode = Fn( () => {

		// To correct the lighting as our mesh undulates, we have to reassign the normals in the position shader.
		const { normalX, normalY } = getNormalsFromHeightTSL( vertexIndex, heightStorage );

		varyingProperty( 'vec3', 'v_normalView' ).assign( transformNormalToView( vec3( normalX, negate( normalY ), 1.0 ) ) );

		return vec3( positionLocal.x, positionLocal.y, heightStorage.element( vertexIndex ) );

	} )();

	waterMesh = new THREE.Mesh( waterGeometry, waterMaterial );
	waterMesh.rotation.x = - Math.PI / 2;
	waterMesh.matrixAutoUpdate = false;
	waterMesh.updateMatrix();

	scene.add( waterMesh );

	// THREE.Mesh just for mouse raycasting
	const geometryRay = new THREE.PlaneGeometry( BOUNDS, BOUNDS, 1, 1 );
	meshRay = new THREE.Mesh( geometryRay, new THREE.MeshBasicMaterial( { color: 0xFFFFFF, visible: false } ) );
	meshRay.rotation.x = - Math.PI / 2;
	meshRay.matrixAutoUpdate = false;
	meshRay.updateMatrix();
	scene.add( meshRay );

	// Create sphere THREE.InstancedMesh
	const sphereGeometry = new THREE.SphereGeometry( 4, 24, 12 );
	const sphereMaterial = new THREE.MeshPhongMaterial( { color: 0xFFFF00 } );

	// Initialize sphere mesh instance position and velocity.
	// position<vec3> + velocity<vec2> + unused<vec3> = 8 floats per sphere.
	// for structs arrays must be enclosed in multiple of 4

	const sphereStride = 8;
	const sphereArray = new Float32Array( NUM_SPHERES * sphereStride );

	// Only hold velocity in x and z directions.
	// The sphere is wedded to the surface of the water, and will only move vertically with the water.

	for ( let i = 0; i < NUM_SPHERES; i ++ ) {

		sphereArray[ i * sphereStride + 0 ] = ( Math.random() - 0.5 ) * BOUNDS * 0.7;
		sphereArray[ i * sphereStride + 1 ] = 0;
		sphereArray[ i * sphereStride + 2 ] = ( Math.random() - 0.5 ) * BOUNDS * 0.7;

	}

	const SphereStruct = struct( {
		position: 'vec3',
		velocity: 'vec2'
	} );

	// Sphere Instance Storage
	const sphereVelocityStorage = instancedArray( sphereArray, SphereStruct ).label( 'SphereData' );

	computeSphere = Fn( () => {

		const instancePosition = sphereVelocityStorage.element( instanceIndex ).get( 'position' );
		const velocity = sphereVelocityStorage.element( instanceIndex ).get( 'velocity' );

		// Bring position from range of [ -BOUNDS/2, BOUNDS/2 ] to [ 0, BOUNDS ]
		const tempX = instancePosition.x.add( BOUNDS_HALF );
		const tempZ = instancePosition.z.add( BOUNDS_HALF );

		// Bring position from range [ 0, BOUNDS ] to [ 0, WIDTH ]
		// ( i.e bring geometry range into 'heightmap' range )
		// WIDTH = 128, BOUNDS = 512... same as dividing by 4
		tempX.mulAssign( WIDTH / BOUNDS );
		tempZ.mulAssign( WIDTH / BOUNDS );

		// Can only access storage buffers with uints
		const xCoord = uint( floor( tempX ) );
		const zCoord = uint( floor( tempZ ) );

		// Get one dimensional index
		const heightInstanceIndex = zCoord.mul( WIDTH ).add( xCoord );

		// Set to read-only to be safe, even if it's not strictly necessary for compute access.
		const height = heightStorage.element( heightInstanceIndex );

		// Assign height to sphere position
		instancePosition.y.assign( height );

		// Calculate normal of the water mesh at this location.
		const { normalX, normalY } = getNormalsFromHeightTSL( heightInstanceIndex, heightStorage );

		normalX.mulAssign( 0.1 );
		normalY.mulAssign( 0.1 );

		const waterNormal = vec3( normalX, 0.0, negate( normalY ) );

		const newVelocity = vec3( velocity.x, 0.0, velocity.y ).add( waterNormal );
		newVelocity.mulAssign( 0.998 );

		const newPosition = instancePosition.add( newVelocity ).toVar();

		// Reverse velocity and reset position when exceeding bounds.
		If( newPosition.x.lessThan( - BOUNDS_HALF ), () => {

			newPosition.x = float( - BOUNDS_HALF ).add( 0.001 );
			newVelocity.x.mulAssign( - 0.3 );

		} ).ElseIf( newPosition.x.greaterThan( BOUNDS_HALF ), () => {

			newPosition.x = float( BOUNDS_HALF ).sub( 0.001 );
			newVelocity.x.mulAssign( - 0.3 );

		} );

		If( newPosition.z.lessThan( - BOUNDS_HALF ), () => {

			newPosition.z = float( - BOUNDS_HALF ).add( 0.001 );
			newVelocity.z.mulAssign( - 0.3 );

		} ).ElseIf( newPosition.z.greaterThan( BOUNDS_HALF ), () => {

			newPosition.z = float( BOUNDS_HALF ).sub( 0.001 );
			newVelocity.z.mulAssign( - 0.3 );

		} );

		instancePosition.assign( newPosition );
		velocity.assign( vec2( newVelocity.x, newVelocity.z ) );

	} )().compute( NUM_SPHERES );

	sphereMaterial.positionNode = Fn( () => {

		const instancePosition = sphereVelocityStorage.element( instanceIndex ).get( 'position' );

		const newPosition = positionLocal.add( instancePosition );

		return newPosition;

	} )();

	const sphereMesh = new THREE.InstancedMesh( sphereGeometry, sphereMaterial, NUM_SPHERES );
	scene.add( sphereMesh );

	renderer = new THREE.WebGPURenderer( { antialias: true } );
	renderer.setPixelRatio( window.devicePixelRatio );
	renderer.setSize( window.innerWidth, window.innerHeight );
	renderer.setAnimationLoop( animate );
	container.appendChild( renderer.domElement );

	stats = new Stats();
	container.appendChild( stats.dom );

	container.style.touchAction = 'none';
	container.addEventListener( 'pointermove', onPointerMove );

	window.addEventListener( 'resize', onWindowResize );

	const gui = new GUI();
	gui.add( effectController.mouseSize, 'value', 1.0, 100.0, 1.0 ).name( 'Mouse Size' );
	gui.add( effectController.viscosity, 'value', 0.9, 0.999, 0.001 ).name( 'viscosity' );
	const buttonCompute = {
		smoothWater: function () {

			renderer.computeAsync( computeSmooth );

		}
	};
	gui.add( buttonCompute, 'smoothWater' );
	gui.add( effectController, 'spheresEnabled' ).onChange( () => {

		sphereMesh.visible = effectController.spheresEnabled;

	} );
	gui.add( effectController, 'wireframe' ).onChange( () => {

		waterMesh.material.wireframe = ! waterMesh.material.wireframe;
		waterMesh.material.needsUpdate = true;

	} );

}

function onWindowResize() {

	camera.aspect = window.innerWidth / window.innerHeight;
	camera.updateProjectionMatrix();

	renderer.setSize( window.innerWidth, window.innerHeight );

}

function setMouseCoords( x, y ) {

	mouseCoords.set( ( x / renderer.domElement.clientWidth ) * 2 - 1, - ( y / renderer.domElement.clientHeight ) * 2 + 1 );
	mouseMoved = true;

}

function onPointerMove( event ) {

	if ( event.isPrimary === false ) return;

	setMouseCoords( event.clientX, event.clientY );

}

function animate() {

	render();
	stats.update();

}

function render() {

	if ( mouseMoved ) {

		raycaster.setFromCamera( mouseCoords, camera );

		const intersects = raycaster.intersectObject( meshRay );

		if ( intersects.length > 0 ) {

			const point = intersects[ 0 ].point;
			effectController.mousePos.value.set( point.x, point.z );

		} else {

			effectController.mousePos.value.set( 10000, 10000 );

		}

		mouseMoved = false;

	} else {

		effectController.mousePos.value.set( 10000, 10000 );

	}

	renderer.computeAsync( computeHeight );

	if ( effectController.spheresEnabled ) {

		renderer.computeAsync( computeSphere );

	}

	renderer.render( scene, camera );

}
