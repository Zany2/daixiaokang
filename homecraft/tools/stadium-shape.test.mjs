import assert from 'node:assert/strict';
import test from 'node:test';
import { stadiumRayDistance } from '../world/stadium-shape.js';

const hall={id:'test-hall',x:0,z:0,w:20,d:10,h:10};
const ray=(x,y,z,dx,dy,dz)=>({origin:{x,y,z},direction:{x:dx,y:dy,z:dz}});

test('camera rays meet the stadium body and roof',()=>{
  assert.ok(Math.abs(stadiumRayDistance(hall,ray(-30,2,0,1,0,0))-20)<1e-9);
  assert.ok(Math.abs(stadiumRayDistance(hall,ray(0,30,0,0,-1,0))-19.5)<1e-9);
});
test('camera rays cross empty outer corners without hitting a wall',()=>{
  assert.equal(stadiumRayDistance(hall,ray(9,30,4.5,0,-1,0)),Infinity);
  assert.equal(stadiumRayDistance(hall,ray(0,30,0,0,1,0)),Infinity);
});
test('camera rays detect origins inside the solid and entry from below',()=>{
  assert.equal(stadiumRayDistance(hall,ray(0,2,0,1,0,0)),0);
  assert.equal(stadiumRayDistance(hall,ray(0,-5,0,0,1,0)),5);
});
