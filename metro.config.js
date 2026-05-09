const path = require('path');
const { getDefaultConfig } = require('expo/metro-config');

const projectRoot = __dirname;
const config = getDefaultConfig(projectRoot);

const escapeRegExp = (value) => value.replace(/[|\\{}()[\]^$+*?.]/g, '\\$&');
const pathPattern = (relativePath) =>
  `${escapeRegExp(path.join(projectRoot, relativePath)).replace(/[/\\]+/g, '[/\\\\]')}[/\\\\].*`;

config.resolver.blockList = [
  ...(config.resolver.blockList || []),
  new RegExp(pathPattern(path.join('android', '.gradle'))),
  new RegExp(pathPattern(path.join('android', 'build'))),
  new RegExp(pathPattern(path.join('android', 'app', 'build'))),
];

module.exports = config;