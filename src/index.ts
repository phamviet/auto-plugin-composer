import path from "path";
import { promisify } from "util";
import * as fs from "fs";
import { Auto, IPlugin, execPromise, getCurrentBranch, validatePluginConfiguration } from '@auto-it/core';
import * as t from "io-ts";
import { inc, ReleaseType } from "semver";

const readFile = promisify(fs.readFile);
const writeFile = promisify(fs.writeFile);

const pluginOptions = t.partial({
  /** Optional script that executes release pipeline stages */
  publishScript: t.string
});

export type IComposerPluginOptions = t.TypeOf<typeof pluginOptions>;

interface VersionProviderInterface {
  getPreviousVersion(auto: Auto): Promise<string>
  writeNewVersion(auto: Auto, version: string): Promise<void|string>
}

/** What is the doc */
class Composer implements VersionProviderInterface {
  /** getPreviousVersion */
  async getPreviousVersion(auto: Auto) {
    auto.logger.veryVerbose.info(`Reading version from composer.json`)
    return execPromise("composer", ["config", "version"])
  }

  /** Writes new version to version file at specified location */
  async writeNewVersion(auto: Auto, version: string) {
    auto.logger.veryVerbose.info(`Writing version to composer.json`)
    return execPromise("composer", ["config", "version", version])
  }
}

/** What is the doc */
class PackageJson implements VersionProviderInterface {
  /** getPreviousVersion */
  async getPreviousVersion(auto: Auto) {
    auto.logger.veryVerbose.info(`Reading version from package.json`)
    const packageJson = await PackageJson.getPackageJson();

    return packageJson.version
  }

  /** Writes new version to version file at specified location */
  async writeNewVersion(auto: Auto, version: string) {
    auto.logger.veryVerbose.info(`Writing version to package.json`)

    const packageJson = await PackageJson.getPackageJson();
    const newJson = { ...packageJson };
    newJson.version = version;
    return writeFile(path.join('./', "package.json"), JSON.stringify(newJson, null, 2))
  }

  /** Label map */
  private static async getPackageJson() {
    return JSON.parse(await readFile(path.join('./', "package.json"), "utf-8"));
  }
}

/**  */
export default class AtlasPlugin implements IPlugin {
  /** The name of the plugin */
  name = 'atlas';

  /** versionProvider */
  readonly versionProvider: VersionProviderInterface

  /** Release script location */
  readonly publishScript: string | undefined

  /** Label map */
  commitLabelMap: { [key: string]: [string] } = {
    fix: ['patch'],
    hotfix: ['patch'],
    feat: ['feature'],
    add: ['feature'],
    new: ['feature'],
    pef: ['performance'],
    '!break': ['major'],
  }

  /** Initialize the plugin with it's options */
  constructor(options: IComposerPluginOptions) {
    this.publishScript = options.publishScript

    if (fs.existsSync(path.join('./', "composer.json"))) {
      this.versionProvider = new Composer()
    } else if (fs.existsSync(path.join('./', "package.json"))) {
      this.versionProvider = new PackageJson()
    } else {
      throw new Error(`auto-plugin-${this.name} failed to start`)
    }
  }

  /** Tap into auto plugin points. */
  apply(auto: Auto) {
    auto.hooks.validateConfig.tapPromise(this.name, async (name, options) => {
      if (name === this.name && typeof options !== "string") {
        return validatePluginConfiguration(this.name, pluginOptions, options);
      }
    });

    auto.hooks.onCreateLogParse.tap(this.name, (logParse) => {
      logParse.hooks.parseCommit.tapPromise(this.name, async (commit) =>{
        if (!auto.semVerLabels || !auto.git) {
          return commit;
        }

        if (commit.pullRequest || commit.subject.includes('skip ci')) {
          return commit
        }

        const modifiedCommit = { ...commit };

        if (!modifiedCommit.labels) {
          modifiedCommit.labels = [];
        }

        const match = Object.keys(this.commitLabelMap).find(type => {
          const subject = commit.subject.toLowerCase()
          return subject.startsWith(type)
        })

        if (match) {
          modifiedCommit.labels = [
            ...new Set([...this.commitLabelMap[match], ...modifiedCommit.labels]),
          ];
        }

        return modifiedCommit
      });

      logParse.hooks.omitCommit.tap(this.name, (commit) => {
        if (commit.subject.startsWith('Merge remote-tracking branch')) {
          return true
        }
      })
    })

    auto.hooks.getPreviousVersion.tapPromise(this.name, () =>{
      return this.versionProvider.getPreviousVersion(auto)
    });

    auto.hooks.version.tapPromise(this.name, async ({ bump, dryRun, quiet }) => {
      const lastVersion = await this.versionProvider.getPreviousVersion(auto)
      const newVersion = inc(lastVersion, bump as ReleaseType);

      if (!newVersion) {
        auto.logger.log.info("No release found, doing nothing");
        return;
      }

      auto.logger.log.info(`Calculated new version as: ${newVersion}`)

      const prefixedTag = auto.prefixRelease(newVersion);

      if (dryRun) {
        if (quiet) {
          console.log(prefixedTag);
        } else {
          auto.logger.log.info(`Would have published: ${prefixedTag}`);
        }

        return;
      }

      await this.versionProvider.writeNewVersion(auto, newVersion)
      await execPromise("git", ["commit", "-am", `"Bump version to: ${prefixedTag} [skip ci]"`]);
      await execPromise("git", [
        "tag",
        prefixedTag,
        "-m",
        `"Update version to ${prefixedTag}"`,
      ]);

      auto.logger.verbose.info("Successfully versioned repo");
    });

    auto.hooks.publish.tapPromise(this.name, async () => {
      const baseBranch = getCurrentBranch() || auto.baseBranch;

      // Call release script if provided
      if(this.publishScript){
        auto.logger.log.info(`Calling release script in repo at ${this.publishScript}`);
        await execPromise(this.publishScript, ["release", auto.remote, baseBranch])
      } else {
        auto.logger.log.info("Skipping calling release script in repo since none was provided");
      }

      auto.logger.log.info("Pushing new tag to GitHub");

      await execPromise("git", [
        "push",
        "--follow-tags",
        "--set-upstream",
        auto.remote,
        baseBranch,
      ]);
    });
  }
}
