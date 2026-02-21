
export const updateMainColWidth = () => {
    const menuCol = document.getElementById("menuCol");
    const root = document.getElementById("root");
    const mainCol = document.getElementById("mainCol");
    
    // Only update if all required elements exist (e.g., in sqlDemoPage)
    if (menuCol && root && mainCol) {
        const menuColWidth = menuCol.offsetWidth;
        const rootWidth = root.offsetWidth;
        const newWidth = rootWidth - menuColWidth - 4;
        mainCol.style.width = newWidth + "px";
    }
}
