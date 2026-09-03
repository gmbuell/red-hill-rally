/** Black countdown panel — "T-05 DAYS" mission-control tile.
 * @startingPoint section="Campaign" subtitle="T-minus countdown panel" viewport="700x260"
 */
export interface CountdownTileProps {
  /** Days until liftoff */
  days?: number;
  label?: string;
}
export declare function CountdownTile(props: CountdownTileProps): JSX.Element;