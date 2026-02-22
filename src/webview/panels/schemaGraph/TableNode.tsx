import React, { memo } from "react";
import { Handle, Position, type NodeProps } from "@xyflow/react";
import type { FieldStat } from "../../../shared/types";

interface TableNodeData {
  label: string;
  fields: FieldStat[];
  indexCount: number;
  [key: string]: unknown;
}

export const TableNode = memo(function TableNode({
  data,
}: NodeProps & { data: TableNodeData }) {
  return (
    <div className="table-node">
      <Handle type="target" position={Position.Left} />
      <div className="table-node-header">
        <span className="table-name">{data.label}</span>
        {data.indexCount > 0 && (
          <span className="index-badge">{data.indexCount} idx</span>
        )}
      </div>
      <div className="table-node-fields">
        {data.fields.slice(0, 15).map((field) => (
          <div key={field.path} className="field-row">
            <span className="field-name">{field.path}</span>
            <span className="field-type">
              {field.types.join(" | ")}
              {field.optionalRate > 0 && "?"}
            </span>
          </div>
        ))}
        {data.fields.length > 15 && (
          <div className="field-row more">
            +{data.fields.length - 15} more fields
          </div>
        )}
      </div>
      <Handle type="source" position={Position.Right} />
    </div>
  );
});
