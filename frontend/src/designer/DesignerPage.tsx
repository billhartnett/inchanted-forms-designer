import { DndProvider } from "react-dnd";
import { HTML5Backend } from "react-dnd-html5-backend";

import DesignerLayout from "./layout/DesignerLayout";
import ComponentSidebar from "./sidebar/ComponentSidebar";
import CanvasArea from "./canvas/CanvasArea";
import PropertiesPanel from "./properties/PropertiesPanel";

export default function DesignerPage() {
  return (
    <DndProvider backend={HTML5Backend}>
      <DesignerLayout
        sidebar={<ComponentSidebar />}
        canvas={<CanvasArea />}
        properties={<PropertiesPanel />}
      />
    </DndProvider>
  );
}
