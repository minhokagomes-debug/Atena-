import tailwindcss from '@tailwindcss/vite';
import react from '@vitejs/plugin-react';
import path from 'path';
import { defineConfig, loadEnv, splitVendorChunkPlugin } from 'vite';
import { visualizer } from 'rollup-plugin-visualizer';
import viteCompression from 'vite-plugin-compression';
import { VitePWA } from 'vite-plugin-pwa';
import Inspect from 'vite-plugin-inspect';
import tsconfigPaths from 'vite-tsconfig-paths';

// https://vitejs.dev/config/
export default defineConfig(({ mode, command }) => {
  // Carregar variáveis de ambiente
  const env = loadEnv(mode, process.cwd(), '');
  
  // Detectar se é produção
  const isProduction = mode === 'production';
  const isDevelopment = mode === 'development';
  
  // Configurações de otimização
  const shouldAnalyze = env.ANALYZE === 'true';
  const shouldCompress = env.COMPRESS === 'true';
  
  console.log(`🚀 Modo: ${mode}`);
  console.log(`📦 Build: ${command}`);
  console.log(`🔧 Otimizações: ${isProduction ? 'Ativadas' : 'Desativadas'}`);

  return {
    // Plugins
    plugins: [
      // React com otimizações
      react({
        // Fast Refresh apenas em desenvolvimento
        fastRefresh: isDevelopment,
        // Babel configurações
        babel: {
          plugins: [
            // Adicionar plugins do babel se necessário
            isProduction && [
              'transform-remove-console',
              { exclude: ['error', 'warn'] }
            ]
          ].filter(Boolean)
        }
      }),
      
      // Tailwind CSS
      tailwindcss(),
      
      // Suporte a paths do TypeScript
      tsconfigPaths(),
      
      // Split vendor chunks
      splitVendorChunkPlugin(),
      
      // PWA suporte
      VitePWA({
        registerType: 'autoUpdate',
        includeAssets: ['favicon.ico', 'apple-touch-icon.png', 'masked-icon.svg'],
        manifest: {
          name: 'ATENA Ω - Neural Evolution Interface',
          short_name: 'ATENA Ω',
          description: 'Interface neural para ATENA Ω - Sistema de evolução contínua',
          theme_color: '#0a0a0f',
          background_color: '#0a0a0f',
          display: 'standalone',
          orientation: 'portrait',
          scope: '/',
          start_url: '/',
          icons: [
            {
              src: '/icons/icon-72x72.png',
              sizes: '72x72',
              type: 'image/png'
            },
            {
              src: '/icons/icon-96x96.png',
              sizes: '96x96',
              type: 'image/png'
            },
            {
              src: '/icons/icon-128x128.png',
              sizes: '128x128',
              type: 'image/png'
            },
            {
              src: '/icons/icon-144x144.png',
              sizes: '144x144',
              type: 'image/png'
            },
            {
              src: '/icons/icon-152x152.png',
              sizes: '152x152',
              type: 'image/png'
            },
            {
              src: '/icons/icon-192x192.png',
              sizes: '192x192',
              type: 'image/png',
              purpose: 'any maskable'
            },
            {
              src: '/icons/icon-384x384.png',
              sizes: '384x384',
              type: 'image/png'
            },
            {
              src: '/icons/icon-512x512.png',
              sizes: '512x512',
              type: 'image/png',
              purpose: 'any maskable'
            }
          ]
        },
        workbox: {
          globPatterns: ['**/*.{js,css,html,ico,png,svg,woff2}'],
          runtimeCaching: [
            {
              urlPattern: /^https:\/\/fonts\.googleapis\.com\/.*/i,
              handler: 'CacheFirst',
              options: {
                cacheName: 'google-fonts-cache',
                expiration: {
                  maxEntries: 10,
                  maxAgeSeconds: 60 * 60 * 24 * 365 // 1 ano
                }
              }
            },
            {
              urlPattern: /^https:\/\/fonts\.gstatic\.com\/.*/i,
              handler: 'CacheFirst',
              options: {
                cacheName: 'gstatic-fonts-cache',
                expiration: {
                  maxEntries: 10,
                  maxAgeSeconds: 60 * 60 * 24 * 365 // 1 ano
                }
              }
            },
            {
              urlPattern: /^https:\/\/api\.atena-omega\.app\/.*/i,
              handler: 'NetworkFirst',
              options: {
                cacheName: 'api-cache',
                networkTimeoutSeconds: 10,
                expiration: {
                  maxEntries: 50,
                  maxAgeSeconds: 60 * 60 // 1 hora
                },
                cacheableResponse: {
                  statuses: [0, 200]
                }
              }
            }
          ]
        },
        devOptions: {
          enabled: false,
          type: 'module'
        }
      }),
      
      // Compressão em produção
      isProduction && shouldCompress && viteCompression({
        algorithm: 'gzip',
        ext: '.gz',
        threshold: 10240, // 10KB
        deleteOriginFile: false
      }),
      
      // Compressão brotli
      isProduction && shouldCompress && viteCompression({
        algorithm: 'brotliCompress',
        ext: '.br',
        threshold: 10240,
        deleteOriginFile: false
      }),
      
      // Análise de bundle
      shouldAnalyze && visualizer({
        filename: 'dist/stats.html',
        open: true,
        gzipSize: true,
        brotliSize: true,
        template: 'treemap'
      }),
      
      // Inspeção (apenas desenvolvimento)
      isDevelopment && Inspect(),
      
    ].filter(Boolean),

    // Definições globais
    define: {
      'process.env.GEMINI_API_KEY': JSON.stringify(env.GEMINI_API_KEY),
      'process.env.NODE_ENV': JSON.stringify(mode),
      '__APP_VERSION__': JSON.stringify(process.env.npm_package_version),
      '__BUILD_TIME__': JSON.stringify(new Date().toISOString()),
      '__DEV__': isDevelopment,
      '__PROD__': isProduction,
    },

    // Resolução de módulos
    resolve: {
      alias: {
        '@': path.resolve(__dirname, './src'),
        '@components': path.resolve(__dirname, './src/components'),
        '@pages': path.resolve(__dirname, './src/pages'),
        '@hooks': path.resolve(__dirname, './src/hooks'),
        '@utils': path.resolve(__dirname, './src/utils'),
        '@services': path.resolve(__dirname, './src/services'),
        '@store': path.resolve(__dirname, './src/store'),
        '@types': path.resolve(__dirname, './src/types'),
        '@assets': path.resolve(__dirname, './src/assets'),
        '@styles': path.resolve(__dirname, './src/styles'),
        '@lib': path.resolve(__dirname, './src/lib'),
        '@config': path.resolve(__dirname, './src/config'),
      },
      extensions: ['.mjs', '.js', '.ts', '.jsx', '.tsx', '.json', '.css']
    },

    // Configurações do servidor
    server: {
      port: parseInt(env.PORT || '3000'),
      host: '0.0.0.0',
      open: env.OPEN_BROWSER === 'true',
      strictPort: true,
      
      // HMR configuration
      hmr: {
        protocol: 'ws',
        host: 'localhost',
        port: 3000,
        timeout: 30000,
        overlay: true,
        clientPort: 3000,
      },
      
      // Proxy para API
      proxy: {
        '/api': {
          target: env.API_URL || 'http://localhost:3001',
          changeOrigin: true,
          secure: false,
          rewrite: (path) => path.replace(/^\/api/, ''),
          configure: (proxy, _options) => {
            proxy.on('error', (err, _req, _res) => {
              console.log('Proxy error:', err);
            });
            proxy.on('proxyReq', (proxyReq, req, _res) => {
              console.log('Proxying:', req.method, req.url);
            });
          }
        },
        '/ws': {
          target: env.WS_URL || 'ws://localhost:3001',
          ws: true,
          changeOrigin: true,
          secure: false,
        }
      },
      
      // Middleware
      middlewareMode: false,
      
      // CORS
      cors: {
        origin: ['http://localhost:3000', 'http://localhost:3001'],
        methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
        allowedHeaders: ['Content-Type', 'Authorization'],
        credentials: true
      }
    },

    // Configurações de preview (produção)
    preview: {
      port: parseInt(env.PREVIEW_PORT || '5000'),
      host: '0.0.0.0',
      open: true,
      strictPort: true,
    },

    // Otimizações de build
    build: {
      outDir: 'dist',
      assetsDir: 'assets',
      target: ['es2020', 'edge88', 'firefox78', 'chrome87', 'safari14'],
      modulePreload: {
        polyfill: true
      },
      minify: isProduction ? 'terser' : false,
      terserOptions: isProduction ? {
        compress: {
          drop_console: true,
          drop_debugger: true,
          pure_funcs: ['console.log', 'console.info', 'console.debug'],
          passes: 3,
          unsafe: true
        },
        mangle: {
          safari10: true,
          properties: {
            regex: /^_/ // Mangle propriedades privadas
          }
        },
        format: {
          comments: false
        }
      } : undefined,
      
      // Source maps
      sourcemap: isDevelopment ? 'inline' : false,
      
      // Rollup opções
      rollupOptions: {
        input: {
          main: path.resolve(__dirname, 'index.html')
        },
        output: {
          manualChunks: (id) => {
            // Separar vendor chunks
            if (id.includes('node_modules')) {
              if (id.includes('react')) {
                return 'vendor-react';
              }
              if (id.includes('@reduxjs/toolkit') || id.includes('redux')) {
                return 'vendor-redux';
              }
              if (id.includes('lodash')) {
                return 'vendor-lodash';
              }
              if (id.includes('chart.js') || id.includes('recharts')) {
                return 'vendor-charts';
              }
              return 'vendor';
            }
            
            // Separar chunks por funcionalidade
            if (id.includes('/src/components/')) {
              return 'components';
            }
            if (id.includes('/src/pages/')) {
              return 'pages';
            }
            if (id.includes('/src/hooks/')) {
              return 'hooks';
            }
          },
          // Nomes dos chunks
          chunkFileNames: isProduction 
            ? 'assets/[name]-[hash].js' 
            : 'assets/[name].js',
          entryFileNames: isProduction 
            ? 'assets/[name]-[hash].js' 
            : 'assets/[name].js',
          assetFileNames: isProduction 
            ? 'assets/[name]-[hash].[ext]' 
            : 'assets/[name].[ext]',
        },
        // Tree shaking
        treeshake: {
          moduleSideEffects: false,
          propertyReadSideEffects: false,
          tryCatchDeoptimization: false,
          unknownGlobalSideEffects: false,
        },
        onwarn(warning, warn) {
          // Ignorar warnings específicos
          if (warning.code === 'CIRCULAR_DEPENDENCY') return;
          if (warning.code === 'UNUSED_EXTERNAL_IMPORT') return;
          if (warning.message.includes('@tailwindcss/vite')) return;
          warn(warning);
        }
      },
      
      // Relatório de tamanho
      reportCompressedSize: true,
      
      // Chunk size warning
      chunkSizeWarningLimit: 1000,
      
      // CSS
      cssCodeSplit: true,
      cssMinify: isProduction,
    },

    // Otimizações de dependências
    optimizeDeps: {
      include: [
        'react',
        'react-dom',
        'react-router-dom',
        '@reduxjs/toolkit',
        'react-redux',
        'axios',
        'lodash',
        'date-fns'
      ],
      exclude: ['@tailwindcss/vite'],
      esbuildOptions: {
        target: 'es2020',
        supported: {
          bigint: true
        }
      }
    },

    // ESBuild
    esbuild: {
      logOverride: { 'this-is-undefined-in-esm': 'silent' },
      treeShaking: true,
      target: 'es2020',
      supported: {
        'import-meta': true
      },
      define: {
        this: 'window'
      }
    },

    // Testes (se usar Vitest)
    test: {
      globals: true,
      environment: 'jsdom',
      setupFiles: './src/test/setup.ts',
      css: true,
      coverage: {
        provider: 'v8',
        reporter: ['text', 'json', 'html'],
        exclude: [
          'src/test/**',
          '**/*.d.ts',
          '**/*.test.{ts,tsx}',
          '**/types/**'
        ]
      }
    },

    // Configurações de logging
    logLevel: isDevelopment ? 'info' : 'warn',
    clearScreen: false,
  };
});
