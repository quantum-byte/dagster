import {gql} from '@apollo/client';
import {
  Box,
  FontFamily,
  Icon,
  Spinner,
  Tooltip,
  colorAccentGray,
  colorAccentGrayHover,
  colorAccentGreen,
  colorAccentRed,
  colorAccentYellow,
  colorBackgroundDefault,
  colorBackgroundGray,
  colorBackgroundLight,
  colorTextDefault,
  colorTextLight,
  colorTextLighter,
  colorLineageNodeBorder,
  colorLineageNodeBorderSelected,
  colorLineageNodeBorderHover,
  colorLineageNodeBackground,
  colorPopoverBackground,
} from '@dagster-io/ui-components';
import countBy from 'lodash/countBy';
import isEqual from 'lodash/isEqual';
import React from 'react';
import ReactDOM from 'react-dom';
import {Link} from 'react-router-dom';
import styled, {CSSObject} from 'styled-components';

import {withMiddleTruncation} from '../app/Util';
import {useAssetLiveData} from '../asset-data/AssetLiveDataProvider';
import {PartitionCountTags} from '../assets/AssetNodePartitionCounts';
import {StaleReasonsTags} from '../assets/Stale';
import {assetDetailsPathForKey} from '../assets/assetDetailsPathForKey';
import {AssetComputeKindTag} from '../graph/OpTags';
import {AssetCheckExecutionResolvedStatus, AssetCheckSeverity} from '../graphql/types';
import {ExplorerPath} from '../pipelines/PipelinePathUtils';
import {markdownToPlaintext} from '../ui/markdownToPlaintext';

import {useAssetNodeMenu} from './AssetNodeMenu';
import {buildAssetNodeStatusContent} from './AssetNodeStatusContent';
import {AssetLatestRunSpinner} from './AssetRunLinking';
import {GraphData, GraphNode, LiveDataForNode} from './Utils';
import {ASSET_NODE_NAME_MAX_LENGTH} from './layout';
import {AssetNodeFragment} from './types/AssetNode.types';

interface Props {
  definition: AssetNodeFragment;
  selected: boolean;
}

export const AssetNode = React.memo(({definition, selected}: Props) => {
  const displayName = definition.assetKey.path[definition.assetKey.path.length - 1]!;
  const isSource = definition.isSource;

  const {liveData} = useAssetLiveData(definition.assetKey);
  return (
    <AssetInsetForHoverEffect>
      <AssetTopTags definition={definition} liveData={liveData} />
      <AssetNodeContainer $selected={selected}>
        <AssetNodeBox $selected={selected} $isSource={isSource}>
          <AssetName $isSource={isSource}>
            <span style={{marginTop: 1}}>
              <Icon name={isSource ? 'source_asset' : 'asset'} />
            </span>
            <div
              data-tooltip={displayName}
              data-tooltip-style={isSource ? NameTooltipStyleSource : NameTooltipStyle}
              style={{overflow: 'hidden', textOverflow: 'ellipsis'}}
            >
              {withMiddleTruncation(displayName, {
                maxLength: ASSET_NODE_NAME_MAX_LENGTH,
              })}
            </div>
            <div style={{flex: 1}} />
          </AssetName>
          <Box style={{padding: '6px 8px'}} flex={{direction: 'column', gap: 4}} border="top">
            {definition.description ? (
              <AssetDescription $color={colorTextDefault()}>
                {markdownToPlaintext(definition.description).split('\n')[0]}
              </AssetDescription>
            ) : (
              <AssetDescription $color={colorTextLight()}>No description</AssetDescription>
            )}
            {definition.isPartitioned && !definition.isSource && (
              <PartitionCountTags definition={definition} liveData={liveData} />
            )}
            <StaleReasonsTags liveData={liveData} assetKey={definition.assetKey} include="self" />
          </Box>

          {isSource && !definition.isObservable ? null : (
            <AssetNodeStatusRow definition={definition} liveData={liveData} />
          )}
          {(liveData?.assetChecks || []).length > 0 && (
            <AssetNodeChecksRow definition={definition} liveData={liveData} />
          )}
        </AssetNodeBox>
        <AssetComputeKindTag definition={definition} style={{right: -2, paddingTop: 7}} />
      </AssetNodeContainer>
    </AssetInsetForHoverEffect>
  );
}, isEqual);

interface AssetTopTagsProps {
  definition: AssetNodeFragment;
  liveData?: LiveDataForNode;
}

const AssetTopTags = ({definition, liveData}: AssetTopTagsProps) => (
  <Box flex={{gap: 4}} padding={{left: 4}} style={{height: 24}}>
    <StaleReasonsTags liveData={liveData} assetKey={definition.assetKey} include="upstream" />
  </Box>
);

const AssetNodeRowBox = styled(Box)`
  white-space: nowrap;
  line-height: 12px;
  font-size: 12px;
  height: 24px;
  a:hover {
    text-decoration: none;
  }
  &:last-child {
    border-bottom-left-radius: 8px;
    border-bottom-right-radius: 8px;
  }
`;

interface StatusRowProps {
  definition: AssetNodeFragment;
  liveData: LiveDataForNode | undefined;
}

const AssetNodeStatusRow = ({definition, liveData}: StatusRowProps) => {
  const {content, background} = buildAssetNodeStatusContent({
    assetKey: definition.assetKey,
    definition,
    liveData,
  });
  return (
    <AssetNodeRowBox
      background={background}
      padding={{horizontal: 8}}
      flex={{justifyContent: 'space-between', alignItems: 'center', gap: 6}}
    >
      {content}
    </AssetNodeRowBox>
  );
};

type AssetCheckIconType =
  | Exclude<
      AssetCheckExecutionResolvedStatus,
      AssetCheckExecutionResolvedStatus.FAILED | AssetCheckExecutionResolvedStatus.EXECUTION_FAILED
    >
  | 'NOT_EVALUATED'
  | 'WARN'
  | 'ERROR';

const AssetCheckIconsOrdered: {type: AssetCheckIconType; content: React.ReactNode}[] = [
  {
    type: AssetCheckExecutionResolvedStatus.IN_PROGRESS,
    content: <Spinner purpose="caption-text" />,
  },
  {
    type: 'NOT_EVALUATED',
    content: <Icon name="dot" color={colorAccentGray()} />,
  },
  {
    type: 'ERROR',
    content: <Icon name="cancel" color={colorAccentRed()} />,
  },
  {
    type: 'WARN',
    content: <Icon name="warning_outline" color={colorAccentYellow()} />,
  },
  {
    type: AssetCheckExecutionResolvedStatus.SKIPPED,
    content: <Icon name="dot" color={colorAccentGray()} />,
  },
  {
    type: AssetCheckExecutionResolvedStatus.SUCCEEDED,
    content: <Icon name="check_circle" color={colorAccentGreen()} />,
  },
];

export const AssetNodeContextMenuWrapper = React.memo(
  ({
    children,
    graphData,
    explorerPath,
    onChangeExplorerPath,
    selectNode,
    node,
  }: {
    children: React.ReactNode;
    graphData: GraphData;
    node: GraphNode;
    selectNode?: (e: React.MouseEvent<any> | React.KeyboardEvent<any>, nodeId: string) => void;
    explorerPath?: ExplorerPath;
    onChangeExplorerPath?: (path: ExplorerPath, mode: 'replace' | 'push') => void;
  }) => {
    const [menuVisible, setMenuVisible] = React.useState(false);
    const [menuPosition, setMenuPosition] = React.useState<{top: number; left: number}>({
      top: 0,
      left: 0,
    });

    const showMenu = (e: React.MouseEvent) => {
      e.preventDefault();
      setMenuVisible(true);
      setMenuPosition({top: e.pageY, left: e.pageX});
    };

    const hideMenu = () => {
      setMenuVisible(false);
    };
    const ref = React.useRef<HTMLDivElement | null>(null);
    React.useEffect(() => {
      const node = ref.current;
      const listener = (e: MouseEvent) => {
        if (ref.current && e.target && !ref.current.contains(e.target as Node)) {
          hideMenu();
        }
      };
      const keydownListener = (e: KeyboardEvent) => {
        if (ref.current && e.code === 'Escape') {
          hideMenu();
        }
      };
      if (menuVisible && node) {
        document.body.addEventListener('click', listener);
        document.body.addEventListener('keydown', keydownListener);
      }
      return () => {
        if (node) {
          document.body.removeEventListener('click', listener);
          document.body.removeEventListener('keydown', keydownListener);
        }
      };
    }, [menuVisible]);
    const {dialog, menu} = useAssetNodeMenu({
      graphData,
      explorerPath,
      onChangeExplorerPath,
      selectNode,
      node,
    });
    return (
      <div ref={ref}>
        <div onContextMenu={showMenu} onClick={hideMenu}>
          {children}
        </div>
        {dialog}
        {menuVisible
          ? ReactDOM.createPortal(
              <div
                style={{
                  position: 'absolute',
                  top: menuPosition.top,
                  left: menuPosition.left,
                  backgroundColor: colorPopoverBackground(),
                  boxShadow: '0 2px 4px rgba(0, 0, 0, 0.1)',
                  zIndex: 10,
                }}
                onClick={(e) => {
                  e.stopPropagation();
                }}
              >
                {menu}
              </div>,
              document.body,
            )
          : null}
      </div>
    );
  },
);

const AssetNodeChecksRow = ({
  definition,
  liveData,
}: {
  definition: AssetNodeFragment;
  liveData: LiveDataForNode | undefined;
}) => {
  if (!liveData || !liveData.assetChecks.length) {
    return <span />;
  }

  const byIconType = countBy(liveData.assetChecks, (c) => {
    const status = c.executionForLatestMaterialization?.status;
    const value: AssetCheckIconType =
      status === undefined
        ? 'NOT_EVALUATED'
        : status === AssetCheckExecutionResolvedStatus.FAILED
        ? c.executionForLatestMaterialization?.evaluation?.severity === AssetCheckSeverity.WARN
          ? 'WARN'
          : 'ERROR'
        : status === AssetCheckExecutionResolvedStatus.EXECUTION_FAILED
        ? 'ERROR'
        : status;
    return value;
  });

  return (
    <AssetNodeRowBox
      padding={{horizontal: 8}}
      flex={{justifyContent: 'space-between', alignItems: 'center', gap: 6}}
      border="top"
      background={colorBackgroundLight()}
    >
      Checks
      <Link
        to={assetDetailsPathForKey(definition.assetKey, {view: 'checks'})}
        onClick={(e) => e.stopPropagation()}
      >
        <Box flex={{gap: 6, alignItems: 'center'}}>
          {AssetCheckIconsOrdered.filter((a) => byIconType[a.type]).map((icon) => (
            <Box flex={{gap: 2, alignItems: 'center'}} key={icon.type}>
              {icon.content}
              {byIconType[icon.type]}
            </Box>
          ))}
        </Box>
      </Link>
    </AssetNodeRowBox>
  );
};

export const AssetNodeMinimal = ({
  selected,
  definition,
  height,
}: {
  selected: boolean;
  definition: AssetNodeFragment;
  height: number;
}) => {
  const {isSource, assetKey} = definition;
  const {liveData} = useAssetLiveData(assetKey);
  const {border, background} = buildAssetNodeStatusContent({assetKey, definition, liveData});
  const displayName = assetKey.path[assetKey.path.length - 1]!;

  return (
    <AssetInsetForHoverEffect>
      <MinimalAssetNodeContainer $selected={selected} style={{paddingTop: (height - 64) / 2}}>
        <TooltipStyled
          content={displayName}
          canShow={displayName.length > 14}
          targetTagName="div"
          position="top"
        >
          <MinimalAssetNodeBox
            $selected={selected}
            $isSource={isSource}
            $background={background}
            $border={border}
          >
            <AssetNodeSpinnerContainer>
              <AssetLatestRunSpinner liveData={liveData} purpose="section" />
            </AssetNodeSpinnerContainer>
            <MinimalName style={{fontSize: 30}} $isSource={isSource}>
              {withMiddleTruncation(displayName, {maxLength: 14})}
            </MinimalName>
          </MinimalAssetNodeBox>
        </TooltipStyled>
      </MinimalAssetNodeContainer>
    </AssetInsetForHoverEffect>
  );
};

// Note: This fragment should only contain fields that are needed for
// useAssetGraphData and the Asset DAG. Some pages of Dagster UI request this
// fragment for every AssetNode on the instance. Add fields with care!
//
export const ASSET_NODE_FRAGMENT = gql`
  fragment AssetNodeFragment on AssetNode {
    id
    graphName
    hasMaterializePermission
    jobNames
    opNames
    opVersion
    description
    computeKind
    isPartitioned
    isObservable
    isSource
    assetKey {
      ...AssetNodeKey
    }
  }

  fragment AssetNodeKey on AssetKey {
    path
  }
`;

const AssetInsetForHoverEffect = styled.div`
  padding: 10px 4px 2px 4px;
  height: 100%;

  & *:focus {
    outline: 0;
  }
`;

const AssetNodeContainer = styled.div<{$selected: boolean}>`
  user-select: none;
  cursor: pointer;
  padding: 6px;
  overflow: clip;
`;

const AssetNodeShowOnHover = styled.span`
  display: none;
`;

const AssetNodeBox = styled.div<{$isSource: boolean; $selected: boolean}>`
  ${(p) =>
    p.$isSource
      ? `border: 2px dashed ${p.$selected ? colorAccentGrayHover() : colorAccentGray()}`
      : `border: 2px solid ${
          p.$selected ? colorLineageNodeBorderSelected() : colorLineageNodeBorder()
        }`};
  ${(p) => p.$selected && `outline: 2px solid ${colorLineageNodeBorderSelected()}`};

  background: ${colorBackgroundDefault()};
  border-radius: 10px;
  position: relative;
  transition: all 150ms linear;
  &:hover {
    ${(p) => !p.$selected && `border: 2px solid ${colorLineageNodeBorderHover()};`};

    box-shadow: rgba(0, 0, 0, 0.12) 0px 2px 12px 0px;
    scale: 1.03;
    ${AssetNodeShowOnHover} {
      display: initial;
    }
  }
`;

/** Keep in sync with DISPLAY_NAME_PX_PER_CHAR */
const NameCSS: CSSObject = {
  padding: '3px 6px',
  color: colorTextDefault(),
  fontFamily: FontFamily.monospace,
  fontWeight: 600,
};

export const NameTooltipCSS: CSSObject = {
  ...NameCSS,
  top: -9,
  left: -12,
  fontSize: 16.8,
};

export const NameTooltipStyle = JSON.stringify({
  ...NameTooltipCSS,
  background: colorLineageNodeBackground(),
  border: `none`,
});

const NameTooltipStyleSource = JSON.stringify({
  ...NameTooltipCSS,
  background: colorBackgroundGray(),
  border: `none`,
});

const AssetName = styled.div<{$isSource: boolean}>`
  ${NameCSS};
  display: flex;
  gap: 4px;
  background: ${(p) => (p.$isSource ? colorBackgroundLight() : colorLineageNodeBackground())};
  border-top-left-radius: 8px;
  border-top-right-radius: 8px;
`;

const AssetNodeSpinnerContainer = styled.div`
  top: 50%;
  position: absolute;
  transform: translate(8px, -16px);
`;

const MinimalAssetNodeContainer = styled(AssetNodeContainer)`
  height: 100%;
`;

const MinimalAssetNodeBox = styled.div<{
  $isSource: boolean;
  $selected: boolean;
  $background: string;
  $border: string;
}>`
  background: ${(p) => p.$background};
  ${(p) =>
    p.$isSource
      ? `border: 4px dashed ${p.$selected ? colorAccentGray() : p.$border}`
      : `border: 4px solid ${p.$selected ? colorLineageNodeBorderSelected() : p.$border}`};

  border-radius: 16px;
  position: relative;
  padding: 4px;
  height: 100%;
  min-height: 86px;
  &:hover {
    box-shadow: rgba(0, 0, 0, 0.12) 0px 2px 12px 0px;
  }
`;

const MinimalName = styled(AssetName)`
  font-weight: 600;
  white-space: nowrap;
  position: absolute;
  background: none;
  top: 50%;
  left: 50%;
  transform: translate(-50%, -50%);
`;

export const AssetDescription = styled.div<{$color: string}>`
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
  color: ${colorTextLighter()};
  font-size: 12px;
`;

const TooltipStyled = styled(Tooltip)`
  height: 100%;
`;
