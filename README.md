# Surface Lab

Surface Lab turns mathematical surfaces into STL meshes for 3D printing. Download and extract this repository, then open **[Surface Lab.html](Surface%20Lab.html)** in your browser. The app runs offline.

Choose from 21 presets or use the selector beside **Expression** to enter a height, parametric, or implicit equation. Adjust the domain and mesh resolution, then drag the preview to orbit. The optimizer can search a height graph for a minimum or maximum using Nelder–Mead, projected gradient descent, or multistage grid search.

## Implicit surfaces

Choose **Implicit** and enter `x^2 + y^2 + z^2 = 1` for a sphere. Equations can have expressions on both sides; a single expression is plotted where it equals zero. The library also includes a gyroid and a one-sheet hyperboloid. Set X, Y and Z bounds independently. The graph is sampled on a 3D grid, so choose a domain where the field is finite and continuous. Increasing resolution or narrowing the bounds can resolve smaller features. The field must change sign across the surface: for example, use `z = 0` rather than `z^2 = 0` for a plane.

**Surface** and **Wireframe** show the equation. **Print mesh** previews the STL: **Filled region** fills the side where the left expression is smaller than the right (negative for a bare expression) and seals cuts at the plot bounds. Swap the sides to fill the opposite region. For a sheet without a block behind it, choose **Thickened surface** in Export STL and set the wall thickness. Implicit exports use one scale for all three axes, so a sphere stays round.

## Piecewise surfaces and OriginLab files

Use `if(x < 0, -x, x)` or `x < 0 ? -x : x` in a height equation or a parametric coordinate. Conditions support comparisons, `&&`, `||` and `!`. Branches can be nested, and only the selected branch supplies the value. A jump between adjacent samples is connected by a mesh face.

**Import Origin file** opens a local 3D parametric Settings definition (`.ofp` or `.xml`). It reads the coordinate formulas, parameter limits, and grid dimensions. Numeric declarations and coordinate helpers using `function double`, local `double` values, `if/else` and `return` translate to editable expressions. Other LabTalk statements produce an import error. [OriginLab's 3D Parametric Function documentation](https://docs.originlab.com/origin-help/pd-dialog-3dparafunc-tab/)

The **Klein bottle** preset uses the same piecewise definition as the Origin example. For its reversed seam, the sampler adds one interval when needed to align the two edges. Its STL uses an adjustable wall with a fused crossing, so the exported solid has approximate wall thickness. Check the sliced layers before printing.

The Origin Rose definition imports at its original 25 × 576 samples. Helper calls can appear inside other helpers and coordinate expressions. The editor supports Origin’s signed real remainder, `rmod(x, y)`. At the rose’s center, an entire parameter edge meets at one point. STL export builds a fused wall around the petals and that center.

## Export a print

To edit a parametric equation, select **Torus**, **Catenoid**, or **Trefoil knot**, then change the expression. Enter an `(x, y, z)` tuple using `u` and `v`. You can define named values on preceding lines. For example, changing `minor = 0.72` to `minor = 1` in Torus thickens the ring. The preview and STL use the edited coordinates. Open parametric sheets have a wall thickness setting in the export dialog.

1. Select **Export STL** and set the XY span and surface relief in millimeters.
2. For a height graph, choose **Flat base** or **Thickened surface**. A thickened surface follows the graph on both sides and closes at the edges. Set **Wall thickness** to the desired total thickness.
3. Check **Solid dimensions**, download the STL, and import it into your slicer in millimeters. Curved undersides may need supports.

Two saddle meshes are included so you can compare the constructions in a slicer.

- [Saddle with a flat base](Hyperbolic%20paraboloid%20-%20100mm.stl)
- [Saddle with a 2 mm curved wall](Hyperbolic%20paraboloid%20-%202mm%20shell.stl)

The editable HTML, CSS, and JavaScript are in [surface-lab/dist](surface-lab/dist/). Open its `index.html` to run the source version directly.
