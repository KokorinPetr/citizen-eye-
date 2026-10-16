import { createBrowserRouter } from "react-router";
import { CenterSheet } from "../features/centers/CenterSheet";
import { PostFlow } from "../features/community/PostFlow";
import { PostSheet } from "../features/community/PostSheet";
import { FeedScreen } from "../features/feed/FeedScreen";
import { NewFeedPost } from "../features/feed/NewFeedPost";
import { ThreadSheet } from "../features/feed/ThreadSheet";
import { IncidentSheet } from "../features/incidents/IncidentSheet";
import { ListScreen } from "../features/list/ListScreen";
import { MapScreen } from "../features/map/MapScreen";
import { MeScreen } from "../features/profile/MeScreen";
import { AskScreen } from "../features/report/AskScreen";
import { PlaceFlow } from "../features/report/PlaceFlow";
import { ReportFlow } from "../features/report/ReportFlow";
import { AppLayout } from "./AppLayout";

/** All routes. Detail sheets are children of the map, so the map stays visible behind them. */
export const router = createBrowserRouter([
  {
    element: <AppLayout />,
    children: [
      {
        path: "/",
        element: <MapScreen />,
        children: [
          { index: true, element: null },
          { path: "incidents/:id", element: <IncidentSheet /> },
          { path: "places/:id", element: <CenterSheet /> },
          { path: "posts/:id", element: <PostSheet /> },
        ],
      },
      { path: "/list", element: <ListScreen /> },
      { path: "/ask", element: <AskScreen /> },
      { path: "/ask/help", element: <ReportFlow /> },
      { path: "/ask/place", element: <PlaceFlow /> },
      { path: "/ask/post", element: <PostFlow /> },
      {
        path: "/feed",
        element: <FeedScreen />,
        children: [
          { index: true, element: null },
          { path: "new", element: <NewFeedPost /> },
          { path: ":id", element: <ThreadSheet /> },
        ],
      },
      { path: "/me", element: <MeScreen /> },
    ],
  },
]);
