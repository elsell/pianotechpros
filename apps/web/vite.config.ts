import { sveltekit } from '@sveltejs/kit/vite';
import { defineConfig } from 'vite';
import adapter from '@sveltejs/adapter-node';
import { vitePreprocess } from '@sveltejs/vite-plugin-svelte';
export default defineConfig({
  plugins: [sveltekit({
    preprocess: vitePreprocess(),
    adapter: adapter(),
    csp: {
      mode: 'nonce',
      directives: {
        'default-src': ['self'],
        'img-src': ['self', 'blob:'],
        // Exact static styles: app wrapper and SvelteKit's screen-reader announcer.
        // Arbitrary inline style attributes remain blocked.
        'style-src-attr': [
          'unsafe-hashes',
          'sha256-tcbDxjMo+xKqM21aCGYbs/QAJqB7yUXC06oPWDapBgc=',
          'sha256-S8qMpvofolR8Mpjy4kQvEm7m1q8clzU4dfDH0AmvZjo='
        ],
        'base-uri': ['self'],
        'connect-src': ['self'],
        'form-action': ['self'],
        'frame-ancestors': ['none'],
        'object-src': ['none']
      }
    }
  })]
});
