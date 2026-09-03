/** Voice tile — flat black or bordered white panel: headline + red accent word + small metadata line. */
export interface CardProps {
  /** Black panel with white type */
  inverse?: boolean;
  headline: string;
  /** Trailing word rendered in Red Hill Red */
  accentWord?: string;
  /** Small caps metadata line at the bottom */
  meta?: string;
  children?: React.ReactNode;
}
export declare function Card(props: CardProps): JSX.Element;