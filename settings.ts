import { createNodeCompoundProgram } from 'sigma/rendering/webgl/programs/common/node';
import NodePointProgram from 'sigma/rendering/webgl/programs/node.point';
import NodePointWithBorderProgram from '@yomguithereal/sigma-experiments-renderers/node/node.point.border';
import NodeHaloProgram from "./node.halo";
import getNodeProgramImage from "./node.image";
import { drawLabel, drawHover } from './node.label';


const startYear = 1939,
  curYear = (new Date).getFullYear(),
  totalYears = curYear - startYear + 1,
  picturesLoadingDelay = 1500,
  playComicsDelay = 1500,
  creatorsRoles = {
    writer: "#234fac",
    artist: "#2b6718",
    both: "#d4a129"
  },
  extraPalette = [
    "#bce25b",
    "#0051c4",
    "#d52f3f",
    "#ded03f",
    "#2cc143",
    "#8b4a98",
    "#5fb1ff",
    "#ff993e",
    "#904f13",
    "#c45ecf"
  ],
  smallScreen = Math.min(window.innerWidth, window.innerHeight) < 600,
  NodeProgramImage = getNodeProgramImage(smallScreen ? 96 : 192),
  sigmaSettings = {
    maxCameraRatio: 75,
    defaultEdgeColor: '#000',
    labelRenderer: drawLabel,
    labelFont: '"DejaVu Sans Mono", "DejaVuSansMono", monospace',
    labelColor: {color: '#AAA'},
    labelWeight: 'bold',
    labelDensity: 0.5,
    labelGridCellSize: 300,
    hoverRenderer: drawHover,
    zoomToSizeRatioFunction: ratio => Math.pow(ratio, 0.75),
    nodeProgramClasses: {
      circle: createNodeCompoundProgram([
        NodeHaloProgram,
        NodePointProgram
      ]),
      image: createNodeCompoundProgram([
        NodeHaloProgram,
        NodePointWithBorderProgram,
        NodeProgramImage
      ])
    },
    nodeHoverProgramClasses: {
      circle: createNodeCompoundProgram([
        NodePointProgram
      ]),
      image: createNodeCompoundProgram([
        NodePointWithBorderProgram,
        NodeProgramImage
      ])
    }
  };

export {
  startYear, curYear, totalYears,
  picturesLoadingDelay, playComicsDelay,
  creatorsRoles,
  extraPalette,
  sigmaSettings
};
