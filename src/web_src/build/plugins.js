import vue from '@vitejs/plugin-vue'
import vueJsx from '@vitejs/plugin-vue-jsx'
import UnoCSS from 'unocss/vite'
import AutoImport from 'unplugin-auto-import/vite'
import { FileSystemIconLoader } from 'unplugin-icons/loaders'
import IconsResolver from 'unplugin-icons/resolver'
import Icons from 'unplugin-icons/vite'
import { NaiveUiResolver } from 'unplugin-vue-components/resolvers'
import Components from 'unplugin-vue-components/vite'
import vueDevTools from 'vite-plugin-vue-devtools'
import viteCompression from 'vite-plugin-compression'
import AutoProxy from './autoProxy'
import { serviceConfig } from '../service.config'

export function createVitePlugins(env) {
  const { VITE_BUILD_COMPRESS = 'no', VITE_HTTP_PROXY = 'no' } = env

  const plugins = [
    // support vue
    vue(),
    vueJsx(),
    vueDevTools(),
    // support unocss
    UnoCSS(),

    // auto import
    AutoImport({
      imports: [
        'vue',
        'vue-router',
        'pinia',
        '@vueuse/core',
        {
          'naive-ui': ['useDialog', 'useMessage', 'useNotification', 'useLoadingBar', 'useModal'],
        },
      ],
      include: [/\.[tj]sx?$/, /\.vue$/, /\.vue\?vue/, /\.md$/],
      dts: 'src/typings/auto-imports.d.ts',
      eslintrc: {
        enabled: true, // 启用
        filepath: './.eslintrc-auto-import.json', // generated file path
        globalsPropValue: true, // 值设为 true 即可
      },
    }),

    // auto import components lib
    Components({
      dts: 'src/typings/components.d.ts',
      resolvers: [
        IconsResolver({
          prefix: false,
          customCollections: ['svg-icons'],
        }),
        NaiveUiResolver(),
      ],
    }),

    // auto import iconify's icons
    Icons({
      defaultStyle: 'display:inline-block',
      compiler: 'vue3',
      customCollections: {
        'svg-icons': FileSystemIconLoader('src/assets/svg-icons', (svg) =>
          svg.replace(/^<svg /, '<svg fill="currentColor" width="1.2em" height="1.2em"'),
        ),
      },
    }),

    AutoProxy({
      enableProxy: VITE_HTTP_PROXY in ['yes', 'Y', 'y', 'true'],
      serviceConfig,
      dts: 'src/typings/auto-proxy.d.ts',
    }),
  ]

  if (VITE_BUILD_COMPRESS in ['yes', 'Y', 'y', 'true']) {
    const { VITE_COMPRESS_TYPE = 'gzip' } = env
    plugins.push(
      viteCompression({
        algorithm: VITE_COMPRESS_TYPE, // compression algorithm
      }),
    )
  }

  return plugins
}
