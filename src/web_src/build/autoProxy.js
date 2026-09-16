// autoProxy.js
import { mkdirSync, writeFileSync } from 'node:fs'
import { dirname } from 'node:path'

/**
 * 创建服务代理插件
 * @param {Object} options - 插件选项
 * @param {Object} options.serviceConfig - 服务配置对象（必填）
 * @param {string} [options.proxyPrefix='proxy-'] - 代理路径前缀（可选）
 * @param {boolean} [options.enableProxy=true] - 是否启用代理配置
 * @param {string} [options.envName='__URL_MAP__'] - 环境变量名（可选）
 * @param {string} [options.dts] - d.ts 类型文件生成路径（可选）
 * @returns {Object} Vite 插件对象
 */
export default function createServiceProxyPlugin(options) {
  const {
    serviceConfig,
    proxyPrefix = 'proxy-',
    enableProxy = true,
    envName = '__URL_MAP__',
    dts,
  } = options

  return {
    name: 'vite-auto-proxy',
    config(config, { mode, command }) {
      // 只在开发环境（serve命令）时生成代理配置
      const isDev = command === 'serve'

      // 在非开发环境也注入空的代理映射，避免运行时错误
      if (!config.define) {
        config.define = {}
      }

      if (!enableProxy || !isDev) {
        const rawMapping = {}
        const envConfig = serviceConfig[mode]

        if (envConfig) {
          Object.entries(envConfig).forEach(([serviceName, serviceUrl]) => {
            rawMapping[serviceName] = {
              path: serviceUrl,
              rawPath: serviceUrl,
            }
          })
          console.warn(`[auto-proxy] 已加载 ${Object.keys(envConfig).length} 个服务地址`)
        }
        else {
          console.warn(`[auto-proxy] 未找到环境 "${mode}" 的配置`)
        }

        config.define[envName] = JSON.stringify(rawMapping)

        // 生成 d.ts 类型文件（如果指定了路径）
        if (dts) {
          generateDtsFile(rawMapping, dts, envName)
        }
        return
      }

      console.warn(`[auto-proxy] 已加载${mode}模式 ${Object.keys(serviceConfig[mode]).length} 个服务地址`)

      const { proxyConfig, proxyMapping } = generateProxyFromServiceConfig(serviceConfig, mode, proxyPrefix)

      Object.entries(proxyMapping).forEach(([serviceName, proxyItem]) => {
        console.warn(`[auto-proxy] 服务: ${serviceName} | 代理地址: ${proxyItem.path} | 实际地址: ${proxyItem.rawPath}`)
      })

      if (proxyConfig && Object.keys(proxyConfig).length > 0) {
        // 确保 server 对象存在
        if (!config.server) {
          config.server = {}
        }

        // 合并代理配置
        config.server.proxy = {
          ...config.server.proxy,
          ...proxyConfig,
        }
        config.define[envName] = JSON.stringify(proxyMapping)
        console.warn(`[auto-proxy] 代理映射已注入到 ${envName}`)

        // 生成 d.ts 类型文件（如果指定了路径）
        if (dts) {
          generateDtsFile(proxyMapping, dts, envName)
        }
      }
      else {
        console.warn(`[auto-proxy] 未生成任何代理配置`)
        config.define[envName] = JSON.stringify({})

        // 生成空的 d.ts 类型文件（如果指定了路径）
        if (dts) {
          generateDtsFile({}, dts, envName)
        }
      }
    },
  }
}

/**
 * 从服务配置生成代理配置
 * @param {Object} serviceConfig - 服务配置
 * @param {string} mode - 环境模式
 * @param {string} proxyPrefix - 代理前缀
 * @returns {Object} 代理配置和代理映射
 */
function generateProxyFromServiceConfig(
  serviceConfig,
  mode,
  proxyPrefix,
) {
  try {
    // 获取当前环境的配置
    const envConfig = serviceConfig[mode]
    if (!envConfig) {
      console.warn(`[auto-proxy] 未找到环境 "${mode}" 的配置，使用 development 配置`)
      const defaultConfig = serviceConfig.development
      if (!defaultConfig) {
        console.error(`[auto-proxy] 也未找到 development 配置`)
        return { proxyConfig: {}, proxyMapping: {} }
      }
      return generateProxyFromConfig(defaultConfig, proxyPrefix)
    }

    return generateProxyFromConfig(envConfig, proxyPrefix)
  }
  catch (error) {
    console.error(`[auto-proxy] 生成代理配置失败:`, error.message)
    return { proxyConfig: {}, proxyMapping: {} }
  }
}

/**
 * 从配置生成代理
 * @param {Object} envConfig - 环境配置
 * @param {string} proxyPrefix - 代理前缀
 * @returns {Object} 代理配置和代理映射
 */
function generateProxyFromConfig(
  envConfig,
  proxyPrefix,
) {
  const proxyConfig = {}
  const proxyMapping = {}

  Object.entries(envConfig).forEach(([serviceName, serviceUrl]) => {
    if (typeof serviceUrl === 'string' && serviceUrl.trim()) {
      const proxyPath = `/${proxyPrefix}${serviceName}`

      const isWs = serviceUrl.startsWith('ws://') || serviceUrl.startsWith('wss://')
      // 生成代理配置
      proxyConfig[proxyPath] = {
        target: serviceUrl,
        changeOrigin: true,
        ws: isWs,
        rewrite: (path) => path.replace(new RegExp(`^/${proxyPrefix}${serviceName}`), ''),
      }

      // 生成代理映射
      proxyMapping[serviceName] = {
        path: proxyPath,
        rawPath: serviceUrl,
      }
    }
  })

  return { proxyConfig, proxyMapping }
}

/**
 * 生成类型定义文件
 * @param {Object} mapping - 代理映射
 * @param {string} outputPath - 输出路径
 * @param {string} envName - 环境变量名
 */
function generateDtsFile(
  mapping,
  outputPath,
  envName,
) {
  try {
    const serviceNames = Object.keys(mapping).map(name => `'${name}'`).join(' | ')
    const serviceNameType = serviceNames || 'never'

    const dtsContent = `/* eslint-disable */
/* prettier-ignore */
// @ts-nocheck
// noinspection JSUnusedGlobalSymbols
// Generated by auto-proxy
// biome-ignore lint: disable
export {}

type serviceName = ${serviceNameType}

declare global {
  const ${envName}: {
    [K in serviceName]: {
      path: string
      rawPath: string
    }
  }
}
`

    const dir = dirname(outputPath)
    if (dir) {
      mkdirSync(dir, { recursive: true })
    }
    writeFileSync(outputPath, dtsContent, 'utf-8')
  }
  catch (error) {
    console.error(`[auto-proxy] 生成 d.ts 文件失败:`, error.message)
  }
}
