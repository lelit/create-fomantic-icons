// node
import { resolve as resolvePath } from 'path';
import { createWriteStream } from 'fs';

// npm
import Liquid from 'liquidjs';
import * as fse from 'fs-extra';

// modals
import Icon from '../modals/Icon';

// enums
import IconType from '../enums/IconType';

// tasks
import { PromptResults } from './InitialPrompt';
import { ParseResults } from '../parsers/FontAwesome';

// utils
import Logger, { spinner } from '../util/Logger';

export default function run(results: PromptResults, parseResults: ParseResults, createManifest: boolean): Promise<void> {
  return new Promise((resolve) => {
    Logger.log();
    const distSpinner = spinner()
      .start('building dist');

    const engine = new Liquid({
      root: resolvePath(__dirname, '../../src/templates'),
      extname: '.liquid',
    });

    const ctx: { [key: string]: any } = parseResults;
    ctx.version = results.asset.version;

    const distFiles: { [key: string]: string } = {
      'icon.html.eco': 'docs/server/documents/elements/',
      'icon.overrides': 'ui/src/themes/default/elements/',
      'icon.variables': 'ui/src/themes/default/elements/',
    };

    const templateFileRenderFuncs = Object.keys(distFiles)
      .map(filename => new Promise((resolveRender, rejectRender) => {
        engine.renderFile(`${filename}.liquid`, ctx)
          .then((renderResult) => {
            const fileOutputDirectory = resolvePath(results.distPath, distFiles[filename]);
            fse.mkdirp(fileOutputDirectory)
              .then(() => {
                fse.writeFile(
                  resolvePath(fileOutputDirectory, filename),
                  renderResult,
                )
                  .then(() => resolveRender())
                  .catch(rejectRender);
              })
              .catch(rejectRender);
          })
          .catch(rejectRender);
      }));

    const copyAssetsFunc = new Promise((resolveAssetCopy, rejectAssetCopy) => {
      fse.readdir(parseResults.fontAssetsDirectory)
        .then((files) => {
          let copiedFiles = 0;
          const copied = () => {
            copiedFiles += 1;
            if (copiedFiles >= files.length) {
              resolveAssetCopy();
            }
          };

          const distPath = resolvePath(results.distPath, 'ui/src/themes/default/assets/fonts');
          fse.mkdirp(distPath)
            .then(() => {
              files.forEach((file) => {
                const filenameSplit = file.split('.');
                const newFileName = `${parseResults.fontFileNames[filenameSplit[0]]}.${filenameSplit[1]}`;
                const assetFilePath = resolvePath(
                  parseResults.fontAssetsDirectory,
                  file,
                );
                const assetDistPath = resolvePath(distPath, newFileName);
                fse.copyFile(assetFilePath, assetDistPath)
                  .then(() => {
                    copied();
                  })
                  .catch(rejectAssetCopy);
              });
            })
            .catch(rejectAssetCopy);
        })
        .catch(rejectAssetCopy);
    });

    const dumpManifest = new Promise((resolveDump, rejectDump) => {
      if(createManifest) {
        const manifestFile = resolvePath(results.distPath, 'manifest.txt');
        var stream = createWriteStream(manifestFile);
        Object.keys(IconType).map((kind) => {
          var icons: Icon[] = parseResults.icons[IconType[kind as keyof typeof IconType]].icons;
          icons.forEach((icon: Icon) => {
            var classes = icon.className.split('.').join(' ');
            var unicode = icon.unicode.slice(1);
            var type = icon.type;
            var label, style, variant;

            if(type == 'solid') {
              variant = style = 'solid';
            } else if(type == 'outline') {
              variant = 'outline';
              style = 'regular';
            } else if(type == 'brand') {
              variant = 'brand';
              style = 'brands';
            }

            function titleize(str: string) {
              return str.replace(/\b\w+/g, function(s: string) { return s.charAt(0).toUpperCase() + s.slice(1); });
            }

            if(variant == 'outline' && classes.includes(' outline')) {
              label = titleize(classes.replace(' outline', ''));
            } else if(classes.startsWith('cc ')) {
              label = titleize(classes.slice(3)) + ' Credit Card';
            } else if(classes.endsWith('00px')) {
              label = '500px';
            } else {
              label = titleize(classes);
            }

            stream.write(`${unicode}-${style}`);
            stream.write('\t');
            stream.write(classes);
            stream.write('\t');
            stream.write(`${label} (${variant})`);
            stream.write('\n');
          });
        });
        stream.close();
        Logger.log(`  Manifest saved to ${manifestFile}`);
      }
      resolveDump();
    });

    fse.mkdirp(results.distPath)
      .then(() => {
        Promise
          .all([
            ...templateFileRenderFuncs,
            copyAssetsFunc,
            dumpManifest,
          ])
          .then(() => {
            distSpinner.succeed('build all dist files');
            Logger.log(`  Files saved to ${results.distPath}`);
            resolve();
          })
          .catch((err) => {
            distSpinner.stop();
            Logger.error(err);
            process.exit(1);
          });
      })
      .catch((err) => {
        distSpinner.stop();
        Logger.error(err);
        process.exit(1);
      });
  });
}
