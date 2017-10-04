import * as fs from 'fs';
import * as webpack from 'webpack';
import * as path from 'path';
import * as ts from 'typescript';
const HtmlWebpackPlugin = require('html-webpack-plugin');
const SubresourceIntegrityPlugin = require('webpack-subresource-integrity');

import { packageChunkSort } from '../../utilities/package-chunk-sort';
import { BaseHrefWebpackPlugin } from '../../lib/base-href-webpack';
import { extraEntryParser, lazyChunksFilter } from './utils';
import { WebpackConfigOptions } from '../webpack-config';


export function getBrowserConfig(wco: WebpackConfigOptions) {
  const { projectRoot, buildOptions, appConfig } = wco;

  const appRoot = path.resolve(projectRoot, appConfig.root);

  let extraPlugins: any[] = [];

  // figure out which are the lazy loaded entry points
  const lazyChunks = lazyChunksFilter([
    ...extraEntryParser(appConfig.scripts, appRoot, 'scripts'),
    ...extraEntryParser(appConfig.styles, appRoot, 'styles')
  ]);

  if (buildOptions.vendorChunk) {
    // Separate modules from node_modules into a vendor chunk.
    const nodeModules = path.resolve(projectRoot, 'node_modules');
    // Resolves all symlink to get the actual node modules folder.
    const realNodeModules = fs.realpathSync(nodeModules);
    // --aot puts the generated *.ngfactory.ts in src/$$_gendir/node_modules.
    const genDirNodeModules = path.resolve(appRoot, '$$_gendir', 'node_modules');

    extraPlugins.push(new webpack.optimize.CommonsChunkPlugin({
      name: 'vendor',
      chunks: ['main'],
      minChunks: (module: any) => {
        return module.resource
            && (   module.resource.startsWith(nodeModules)
                || module.resource.startsWith(genDirNodeModules)
                || module.resource.startsWith(realNodeModules));
      }
    }));
  }

  if (buildOptions.sourcemaps) {
    extraPlugins.push(new webpack.SourceMapDevToolPlugin({
      filename: '[file].map[query]',
      moduleFilenameTemplate: '[resource-path]',
      fallbackModuleFilenameTemplate: '[resource-path]?[hash]',
      sourceRoot: 'webpack:///'
    }));
  }

  if (buildOptions.commonChunk) {
    extraPlugins.push(new webpack.optimize.CommonsChunkPlugin({
      name: 'main',
      async: 'common',
      children: true,
      minChunks: 2
    }));
  }

  if (buildOptions.subresourceIntegrity) {
    extraPlugins.push(new SubresourceIntegrityPlugin({
      hashFuncNames: ['sha384']
    }));
  }

  const supportES2015 = wco.tsConfig.options.target !== ts.ScriptTarget.ES3
                     && wco.tsConfig.options.target !== ts.ScriptTarget.ES5;

  return {
    resolve: {
      mainFields: [
        ...(supportES2015 ? ['es2015'] : []),
        'browser', 'module', 'main'
      ]
    },
    output: {
      crossOriginLoading: buildOptions.subresourceIntegrity ? 'anonymous' : false
    },
    plugins: [
      new HtmlWebpackPlugin({
        template: path.resolve(appRoot, appConfig.index),
        filename: path.resolve(buildOptions.outputPath, appConfig.index),
        chunksSortMode: packageChunkSort(appConfig),
        excludeChunks: lazyChunks,
        xhtml: true,
        minify: buildOptions.target === 'production' ? {
          caseSensitive: true,
          collapseWhitespace: true,
          keepClosingSlash: true
        } : false
      }),
      new BaseHrefWebpackPlugin({
        baseHref: buildOptions.baseHref
      }),
      new webpack.optimize.CommonsChunkPlugin({
        minChunks: Infinity,
        name: 'inline'
      })
    ].concat(extraPlugins),
    node: {
      fs: 'empty',
      // `global` should be kept true, removing it resulted in a
      // massive size increase with Build Optimizer on AIO.
      global: true,
      crypto: 'empty',
      tls: 'empty',
      net: 'empty',
      process: true,
      module: false,
      clearImmediate: false,
      setImmediate: false
    }
  };
}
