import { Auto, IPlugin, execPromise, getCurrentBranch, validatePluginConfiguration } from '@auto-it/core';
import * as t from "io-ts";
import { inc, ReleaseType } from "semver";

const pluginOptions = t.partial({
  /** Optional script that executes release pipeline stages */
  publishScript: t.string
});

export type IComposerPluginOptions = t.TypeOf<typeof pluginOptions>;

/** doc */
async function getPreviousVersion(auto: Auto) {
  auto.logger.veryVerbose.info(`Reading version from composer.json`)
  return execPromise("composer", ["config", "version"])
}

/** Writes new version to version file at specified location */
async function writeNewVersion(auto: Auto, version: string) {
  auto.logger.veryVerbose.info(`Writing version to composer.json`)
  return execPromise("composer", ["config", "version", version])
}

/**  */
export default class ComposerPlugin implements IPlugin {
  /** The name of the plugin */
  name = 'composer';

  /** Release script location */
  readonly publishScript: string | undefined

  /** Initialize the plugin with it's options */
  constructor(options: IComposerPluginOptions) {
    this.publishScript = options.publishScript
  }

  /** Tap into auto plugin points. */
  apply(auto: Auto) {
    const branch = getCurrentBranch();

    auto.hooks.validateConfig.tapPromise(this.name, async (name, options) => {
      // If it's a string thats valid config
      if (name === this.name && typeof options !== "string") {
        return validatePluginConfiguration(this.name, pluginOptions, options);
      }
    });

    auto.hooks.getPreviousVersion.tapPromise(this.name, () =>{
      return getPreviousVersion(auto)
    });

    auto.hooks.version.tapPromise(this.name, async ({ bump }) => {
      const lastVersion = await getPreviousVersion(auto)
      const newVersion = inc(lastVersion, bump as ReleaseType);

      auto.logger.log.info(`Calculated new version as: ${newVersion}`)

      if (newVersion){
        // Seal versions via commit and tag
        await writeNewVersion(auto, newVersion)
        await execPromise("git", ["commit", "-am", `"Bump version to: v${newVersion} [skip ci]"`]);
        await execPromise("git", [
          "tag",
          `v${newVersion}`
        ]);
        auto.logger.verbose.info("Successfully versioned repo");
      } else {
        auto.logger.log.error(`Error: Unable to calculate new version based off of ${lastVersion} being bumped with a ${bump} release`)
        throw new Error ("Version bump failed")
      }
    });

    auto.hooks.publish.tapPromise(this.name, async () => {
      const baseBranch = branch || auto.baseBranch;

      // Call release script if provided
      if(this.publishScript){
        auto.logger.log.info(`Calling release script in repo at ${this.publishScript}`);
        await execPromise(this.publishScript, ["release", auto.remote, baseBranch])
      } else {
        auto.logger.log.info("Skipping calling release script in repo since none was provided");
      }

      // push tag and version change commit up
      await execPromise("git", ["push", auto.remote, baseBranch, "--tags"]);
    });
  }
}
