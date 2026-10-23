import test from 'node:test';
import assert from 'node:assert/strict';
import {ownedPhotoCachePath} from './photo-cache-path';
const root='file:///app/cache/';
const id='12345678-1234-4234-8234-123456789abc';
test('accepts only picker/render UUID files in their SDK cache locations',()=>{
 for(const path of [`${id}.HEIC`,`ImagePicker/${id}.jpg`])assert.equal(ownedPhotoCachePath(root,root+path,'picker'),true);
 assert.equal(ownedPhotoCachePath(root,`${root}ImageManipulator/${id}.jpg`,'rendered'),true);
 assert.equal(ownedPhotoCachePath(root.slice(0,-1),`${root}ImageManipulator/${id}.jpg`,'rendered'),true);
});
test('rejects library, network, traversal, prefix confusion and unrelated cache files',()=>{
 for(const path of [`file:///library/${id}.jpg`,`https://example.invalid/${id}.jpg`,`${root}../${id}.jpg`,`${root}ImagePicker/%2e%2e/${id}.jpg`,`${root}ImagePicker/${id}.jpg?x=1`,`${root}ImagePicker/${id}.jpg#x`,`${root}ImagePicker/${id}.jpg/child`,`${root}ImagePicker/not-owned.jpg`,`file:///app/cache-other/${id}.jpg`,`${root}ImageManipulator/${id}.jpg`])assert.equal(ownedPhotoCachePath(root,path,'picker'),false,path);
 assert.equal(ownedPhotoCachePath(root,`${root}${id}.jpg`,'rendered'),false);
 assert.equal(ownedPhotoCachePath(root,`${root}ImageManipulator/${id}.png`,'rendered'),false);
});
