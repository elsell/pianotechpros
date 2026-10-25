import {crawlerRobots} from '@pianotechpros/client-core';
import {publicWebOrigin} from '#lib/server/config.js';
import type {RequestHandler} from './$types';

export const GET:RequestHandler=()=>new Response(crawlerRobots(publicWebOrigin),{
 headers: {
  'content-type': 'text/plain; charset=utf-8',
  'cache-control': 'no-store',
 },
});
