import { useNavigate } from "react-router-dom";
import { HandHeart, MessagesSquare } from "lucide-react";
import { Segmented } from "../ui";
import { rememberCommunityTab, type CommunityTab } from "../lib/community";

/**
 * Switches between the Community Feed and Volunteer Opportunities. Uses
 * `replace` so the two sub-tabs don't pile up in the back history.
 */
export default function CommunityTabs({ value }: { value: CommunityTab }) {
  const navigate = useNavigate();
  return (
    <div className="pad-x community-tabs">
      <Segmented
        options={[
          { value: "feed" as CommunityTab, label: "Feed", icon: MessagesSquare },
          { value: "help" as CommunityTab, label: "Volunteer", icon: HandHeart },
        ]}
        value={value}
        onChange={(v) => {
          rememberCommunityTab(v);
          navigate(v === "feed" ? "/feed" : "/help", { replace: true });
        }}
      />
    </div>
  );
}
