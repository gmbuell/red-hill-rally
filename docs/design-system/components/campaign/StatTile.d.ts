/** Rally-status stat tile — hero numeral + caps label. */
export interface StatTileProps {
  value: string | number;
  /** Suffix rendered in red, e.g. "%" */
  unit?: string;
  label?: string;
  /** Second line in red, e.g. "Mrs. Crain" */
  sublabel?: string;
  /** Black panel (default) or bordered white */
  inverse?: boolean;
}
export declare function StatTile(props: StatTileProps): JSX.Element;