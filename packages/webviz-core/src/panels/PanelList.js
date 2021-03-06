// @flow
//
//  Copyright (c) 2018-present, GM Cruise LLC
//
//  This source code is licensed under the Apache License, Version 2.0,
//  found in the LICENSE file in the root directory of this source tree.
//  You may not use this file except in compliance with the License.

import * as React from "react";
import { DragSource } from "react-dnd";
import { MosaicDragType, getNodeAtPath, updateTree } from "react-mosaic-component";
import { connect } from "react-redux";

import { changePanelLayout, savePanelConfig } from "webviz-core/src/actions/panels";
import { Item } from "webviz-core/src/components/Menu";
import SubMenu from "webviz-core/src/components/Menu/SubMenu";
import { getGlobalHooks } from "webviz-core/src/loadWebviz";
import type { State } from "webviz-core/src/reducers";
import type { PanelConfig, SaveConfigPayload } from "webviz-core/src/types/panels";
import { getPanelIdForType } from "webviz-core/src/util";
import naturalSort from "webviz-core/src/util/naturalSort";

type PanelListItem = {|
  title: string,
  component: React.ComponentType<any>,
  presets?: {| title: string, panelConfig?: PanelConfig |}[],
|};

const panelList: PanelListItem[] = getGlobalHooks().panelList();

type DropDescription = {
  panelType: string,
  panelConfig: ?PanelConfig,
  position: string,
  path: string,
};
type PanelItemProps = {
  panel: {|
    type: string,
    title: string,
    panelConfig?: PanelConfig,
  |},
  // this comes from react-dnd
  connectDragSource: (any) => void,
  onClick: () => void,
  // the props here are actually used in the dragSource
  // beginDrag and endDrag callbacks - the props are passed via react-dnd
  // so keep the flow defs here so those functions can have access to some type info
  mosaicId: string, //eslint-disable-line react/no-unused-prop-types
  onDrop: (DropDescription) => void, //eslint-disable-line react/no-unused-prop-types
};

class PanelItem extends React.Component<PanelItemProps> {
  render() {
    const { connectDragSource, panel, onClick } = this.props;
    return connectDragSource(
      <div>
        <Item onClick={onClick}>{panel.title}</Item>
      </div>
    );
  }
}
// react-dnd based config for what to do on drag events
const dragConfig = {
  beginDrag: (props: PanelItemProps, monitor, component) => {
    return {
      mosaicId: props.mosaicId,
    };
  },
  endDrag: (props: PanelItemProps, monitor, component) => {
    const dropResult = monitor.getDropResult() || {};
    const { position, path } = dropResult;

    // dropping outside mosiac does nothing
    if (!position || !path) {
      return;
    }
    props.onDrop({
      panelType: props.panel.type,
      panelConfig: props.panel.panelConfig,
      position,
      path,
    });
  },
};
// boilerplate required by react-dnd
const DraggablePanelItem = DragSource(MosaicDragType.WINDOW, dragConfig, (connect, monitor) => {
  return {
    connectDragSource: connect.dragSource(),
  };
})(PanelItem);

type PanelListProps = {
  mosaicId: string,
  mosaicLayout: any, // this is the opaque mosiac layout config object
  changePanelLayout: (panelLayout: any) => void,
  savePanelConfig: (SaveConfigPayload) => void,
  onPanelSelect: (panelType: string, panelConfig?: PanelConfig) => void,
};
class PanelList extends React.Component<PanelListProps> {
  static getComponentForType(type: string): any | void {
    // $FlowFixMe - bug prevents requiring panelType: https://stackoverflow.com/q/52508434/23649
    const panel = panelList.find((item) => item.component.panelType === type);
    return panel && panel.component;
  }

  // when a panel menu item is dropped
  // we need to update the panel layout in redux
  // the actual operations to change the layout
  // are supplied by react-mosaic-component
  onPanelMenuItemDrop = (config: DropDescription) => {
    const { mosaicLayout, changePanelLayout, savePanelConfig } = this.props;
    const { panelType, position, path } = config;
    const newNode = getPanelIdForType(panelType);
    const node = getNodeAtPath(mosaicLayout, path);
    const before = position === "left" || position === "top";
    const [first, second] = before ? [newNode, node] : [node, newNode];
    const direction = position === "left" || position === "right" ? "row" : "column";
    const updates = [
      {
        path,
        spec: {
          $set: { first, second, direction },
        },
      },
    ];
    if (config.panelConfig) {
      savePanelConfig({ id: newNode, config: config.panelConfig });
    }
    const newLayout = updateTree(mosaicLayout, updates);
    changePanelLayout(newLayout);
  };

  // sanity checks to help panel authors debug issues
  _verifyPanels() {
    const panelTypes: Map<string, React.ComponentType<any>> = new Map();
    for (const { component } of panelList) {
      // $FlowFixMe - bug prevents requiring panelType: https://stackoverflow.com/q/52508434/23649
      const { name, displayName, panelType } = component;
      if (!panelType) {
        throw new Error(`Panel component ${displayName || name} must declare a unique \`static panelType\``);
      }
      const existingPanel = panelTypes.get(panelType);
      if (existingPanel) {
        throw new Error(
          `Two components have the same panelType ('${panelType}'): ${existingPanel.displayName ||
            existingPanel.name} and ${displayName || name}`
        );
      }
      panelTypes.set(panelType, component);
    }
  }

  render() {
    this._verifyPanels();
    const { mosaicId, onPanelSelect } = this.props;
    return (
      <React.Fragment>
        {panelList.sort(naturalSort("title")).map(
          // $FlowFixMe - bug prevents requiring panelType: https://stackoverflow.com/q/52508434/23649
          ({ presets, title, component: { panelType } }) =>
            presets ? (
              <SubMenu text={title} key={panelType}>
                {presets.map((subPanelListItem) => (
                  <DraggablePanelItem
                    key={subPanelListItem.title}
                    mosaicId={mosaicId}
                    panel={{
                      type: panelType,
                      title: subPanelListItem.title,
                      panelConfig: subPanelListItem.panelConfig,
                    }}
                    onDrop={this.onPanelMenuItemDrop}
                    onClick={() => onPanelSelect(panelType, subPanelListItem.panelConfig)}
                  />
                ))}
              </SubMenu>
            ) : (
              <DraggablePanelItem
                key={panelType}
                mosaicId={mosaicId}
                panel={{ type: panelType, title }}
                onDrop={this.onPanelMenuItemDrop}
                onClick={() => onPanelSelect(panelType)}
              />
            )
        )}
      </React.Fragment>
    );
  }
}

const mapStateToProps = (state: State) => ({
  mosaicId: state.mosaic.mosaicId,
  mosaicLayout: state.panels.layout,
});
export default connect(
  mapStateToProps,
  { changePanelLayout, savePanelConfig }
)(PanelList);
