/** Sponsor recognition board — black panel, two-column underlined wordmarks. */
export interface SponsorBoardProps {
  title?: string;
  /** Sponsor names, rendered as caps wordmarks */
  sponsors: string[];
}
export declare function SponsorBoard(props: SponsorBoardProps): JSX.Element;