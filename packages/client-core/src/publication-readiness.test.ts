import assert from 'node:assert/strict';
import test from 'node:test';
import {publicationReadiness} from './publication-readiness.js';
test('a new piano identifies all requirements in editor order',()=>{
 assert.deepEqual(publicationReadiness({},0),['form','condition','title','photo']);
});
test('make supplies the public title fallback but model alone does not',()=>{
 assert.deepEqual(publicationReadiness({form:'grand',condition:'used',make:'Kawai'},1),[]);
 assert.deepEqual(publicationReadiness({form:'grand',condition:'used',title:'  ',make:''},1),['title']);
});
test('explicit title and existing ready photo permit review without requiring price',()=>{
 assert.deepEqual(publicationReadiness({form:'grand',condition:'used',title:'Concert grand'},1),[]);
 assert.deepEqual(publicationReadiness({form:'grand',condition:'used',title:'Concert grand'},0),['photo']);
});
