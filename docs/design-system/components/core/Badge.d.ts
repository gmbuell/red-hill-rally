/** Boxed caps label ("MISSION CONTROL") — status and metadata tags. */
export interface BadgeProps {
  variant?: 'outline' | 'solid' | 'accent';
  children: React.ReactNode;
}
export declare function Badge(props: BadgeProps): JSX.Element;