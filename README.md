# Surface Lab

Surface Lab turns mathematical surfaces into STL meshes for 3D printing. Download and extract this repository, then open **[Surface Lab.html](Surface%20Lab.html)** in your browser. The app runs offline.

Choose from 17 presets or enter a height equation such as `sin(x) * cos(y)`. Adjust the domain and mesh resolution, then drag the preview to orbit. The optimizer can search a height graph for a minimum or maximum using Nelder–Mead, projected gradient descent, or multistage grid search.

## Export a print

1. Select **Export STL** and set the XY span and surface relief in millimeters.
2. For a height graph, choose **Flat base** or **Thickened surface**. A thickened surface follows the graph on both sides and closes at the edges. Set **Wall thickness** to the desired total thickness.
3. Check **Solid dimensions**, download the STL, and import it into your slicer in millimeters. Curved undersides may need supports.

Two saddle meshes are included so you can compare the constructions in a slicer.

- [Saddle with a flat base](Hyperbolic%20paraboloid%20-%20100mm.stl)
- [Saddle with a 2 mm curved wall](Hyperbolic%20paraboloid%20-%202mm%20shell.stl)

The editable HTML, CSS, and JavaScript are in [surface-lab/dist](surface-lab/dist/). Open its `index.html` to run the source version directly.
