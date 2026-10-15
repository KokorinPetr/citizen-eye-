import { Marker, Tooltip } from "react-leaflet";
import { useNavigate } from "react-router";
import type { CenterType, PostCategory } from "../../api/types";
import { useCenters } from "../centers/api";
import { usePosts } from "../community/api";
import { useIncidents } from "../incidents/api";
import { centerIcon, incidentIcon, postIcon } from "./markers";

export function IncidentMarkers({ bbox, urgentOnly }: { bbox: string | null; urgentOnly: boolean }) {
  const navigate = useNavigate();
  const { data: incidents = [] } = useIncidents(bbox, urgentOnly);
  return incidents.map((incident) => (
    <Marker
      key={incident.id}
      position={[incident.location.lat, incident.location.lng]}
      icon={incidentIcon(incident)}
      zIndexOffset={incident.magnitude * 10}
      title={incident.title}
      eventHandlers={{ click: () => navigate(`/incidents/${incident.id}`) }}
    />
  ));
}

export function CenterMarkers({ bbox, types }: { bbox: string | null; types: CenterType[] }) {
  const navigate = useNavigate();
  const { data: centers = [] } = useCenters(bbox, types);
  if (types.length === 0) return null; // all place layers off: nothing, not old results
  return centers.map((center) => (
    <Marker
      key={center.id}
      position={[center.location.lat, center.location.lng]}
      icon={centerIcon(center)}
      title={center.name}
      eventHandlers={{ click: () => navigate(`/places/${center.id}`) }}
    />
  ));
}

interface PostMarkersProps {
  bbox: string | null;
  categories: PostCategory[];
  withReward: boolean;
}

export function PostMarkers({ bbox, categories, withReward }: PostMarkersProps) {
  const navigate = useNavigate();
  const { data: posts = [] } = usePosts(bbox, categories, withReward);
  return posts.map((post) => (
    <Marker
      key={post.id}
      position={[post.location.lat, post.location.lng]}
      icon={postIcon(post)}
      title={post.title}
      eventHandlers={{ click: () => navigate(`/posts/${post.id}`) }}
    >
      {post.reward_amount ? <Tooltip direction="top">{post.title}</Tooltip> : null}
    </Marker>
  ));
}
