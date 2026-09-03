/** Rocket-thermometer progress display with hero percentage.
 * @startingPoint section="Campaign" subtitle="Rocket thermometer + percentage" viewport="700x220"
 */
export interface ProgressMeterProps {
  /** 0–100 */
  percent?: number;
  label?: string;
  /** e.g. class or teacher name, shown in red */
  attribution?: string;
}
export declare function ProgressMeter(props: ProgressMeterProps): JSX.Element;