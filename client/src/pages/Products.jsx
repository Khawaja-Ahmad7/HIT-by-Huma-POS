import React, { useState, useEffect } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import {
  PlusIcon,
  PencilIcon,
  TrashIcon,
  MagnifyingGlassIcon,
  FunnelIcon,
  QrCodeIcon,
  ChevronDownIcon,
  ChevronRightIcon,
  XMarkIcon,
  PhotoIcon,
  DocumentDuplicateIcon,
  TagIcon,
  PrinterIcon,
  EyeIcon,
  ArrowPathIcon,
  MinusIcon,
  ExclamationTriangleIcon
} from '@heroicons/react/24/outline';
import api from '../services/api';
import toast from 'react-hot-toast';
import { useAuthStore } from '../stores/authStore';

export default function Products() {
  const queryClient = useQueryClient();
  const { user } = useAuthStore();
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedCategory, setSelectedCategory] = useState('');
  const [showProductModal, setShowProductModal] = useState(false);
  const [editingProduct, setEditingProduct] = useState(null);
  const [expandedProducts, setExpandedProducts] = useState(new Set());

  // Check if user is salesman (view-only mode)
  const isSalesman = user?.role?.toLowerCase() === 'salesman' || user?.isSalesman;

  // Fetch products
  const { data: productsData, isLoading, refetch } = useQuery({
    queryKey: ['products', searchQuery, selectedCategory],
    queryFn: () => {
      const params = new URLSearchParams();
      if (searchQuery) params.append('search', searchQuery);
      if (selectedCategory) params.append('categoryId', selectedCategory);
      params.append('include_variants', 'true');
      return api.get(`/products?${params}`).then(res => res.data);
    },
    staleTime: 0, // Always consider data stale to get fresh stock counts
    refetchOnWindowFocus: true, // Refetch when tab gains focus
    refetchOnMount: true // Refetch when component mounts
  });

  // Extract products array from response
  // Extract products array from response with safety check
  const rawProducts = productsData?.products || productsData;
  const products = Array.isArray(rawProducts) ? rawProducts : [];

  // Fetch categories
  const { data: categoriesData } = useQuery({
    queryKey: ['categories'],
    queryFn: () => api.get('/products/categories/list').then(res => res.data)
  });

  // Extract categories and transform to consistent format (support both SQL Server and PostgreSQL formats)
  // Extract categories and transform to consistent format (support both SQL Server and PostgreSQL formats)
  const rawCategoriesData = Array.isArray(categoriesData) ? categoriesData : (categoriesData?.categories || []);
  const safeCategories = Array.isArray(rawCategoriesData) ? rawCategoriesData : [];

  const categories = safeCategories.map(cat => ({
    id: cat.CategoryID || cat.category_id,
    name: cat.CategoryName || cat.category_name
  }));

  // Delete product mutation
  const deleteMutation = useMutation({
    mutationFn: (productId) => api.delete(`/products/${productId}`),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['products'] });
      toast.success('Product deleted successfully');
    },
    onError: (error) => {
      const message = error.response?.data?.message || error.response?.data?.error || 'Failed to delete product';
      toast.error(message);
    }
  });

  const toggleExpand = (productId) => {
    const newExpanded = new Set(expandedProducts);
    if (newExpanded.has(productId)) {
      newExpanded.delete(productId);
    } else {
      newExpanded.add(productId);
    }
    setExpandedProducts(newExpanded);
  };

  const handleEdit = (product) => {
    setEditingProduct(product);
    setShowProductModal(true);
  };

  /* Delete Logic */
  const [productToDelete, setProductToDelete] = useState(null);

  const handleDelete = (product) => {
    setProductToDelete(product);
  };

  const confirmDelete = () => {
    if (productToDelete) {
      deleteMutation.mutate(productToDelete.id);
      setProductToDelete(null);
    }
  };

  /* Label Printing Logic */
  const [printLabelProduct, setPrintLabelProduct] = useState(null);
  const [printQuantity, setPrintQuantity] = useState(1);
  const [loadingVariants, setLoadingVariants] = useState(false);

  const handlePrintLabel = async (product) => {
    const barcode = product.barcode || product.code;
    if (!barcode) {
      toast.error('Product has no barcode. Edit product to generate one.');
      return;
    }

    // Fetch full product details to get color and size
    setLoadingVariants(true);
    try {
      const response = await api.get(`/products/${product.id}`);
      const fullProduct = response.data;

      // Get color and size from variant_name (stored as 'Color' or 'Color / Size' format)
      const variant = fullProduct.variants?.[0];
      let color = null;
      let size = null;

      if (variant?.variant_name && variant.variant_name !== 'Default') {
        const parts = variant.variant_name.split('/').map(p => p.trim());
        color = parts[0] || null;
        size = parts[1] || null;
      }

      setPrintLabelProduct({
        ...product,
        name: fullProduct.product_name || product.name,
        barcode: variant?.barcode || product.barcode || product.code,
        color: color,
        size: size
      });
    } catch (error) {
      console.error('Error fetching product details:', error);
      // Fallback to simple product print
      setPrintLabelProduct(product);
    }
    setLoadingVariants(false);
    setPrintQuantity(1);
  };

  const handlePrintSubmit = async () => {
    if (!printLabelProduct) return;

    // Try the Windows label printer first (via backend API)
    try {
      toast.loading('Printing labels...', { id: 'label-print' });

      // Ensure we use the label printer API
      const response = await api.post('/hardware/label/print', {
        barcode: printLabelProduct.barcode || printLabelProduct.code,
        productName: printLabelProduct.name,
        sku: printLabelProduct.code || printLabelProduct.barcode,
        price: printLabelProduct.basePrice || printLabelProduct.price || 0,
        quantity: printQuantity,
        color: printLabelProduct.color || null, // Include color for label
        size: printLabelProduct.size || null // Include size for label
      });

      if (response.data.success) {
        toast.success(`Printed ${printQuantity} label(s) to ${response.data.printer || 'label printer'}`, { id: 'label-print' });
        setPrintLabelProduct(null);
      } else {
        throw new Error(response.data.message || 'Print failed');
      }
    } catch (error) {
      console.error('Label print error:', error);

      // Fallback to browser printing if backend fails
      const useBrowserPrint = confirm(
        `Label printer error: ${error.response?.data?.message || error.message}\n\n` +
        'Would you like to print using your browser instead?'
      );

      if (useBrowserPrint) {
        printProductLabels({
          name: printLabelProduct.name,
          barcode: printLabelProduct.barcode || printLabelProduct.code,
          price: printLabelProduct.basePrice || printLabelProduct.price,
          color: printLabelProduct.color || null,
          size: printLabelProduct.size || null
        }, printQuantity, false);
      }
      toast.dismiss('label-print');
      setPrintLabelProduct(null);
    }
  };

  const printProductLabels = (productData, quantity, useLabelPrinter) => {
    const labelHTML = `
      <!DOCTYPE html>
      <html>
      <head>
        <title>Product Labels - ${productData.name}</title>
        <style>
          @page {
            size: ${useLabelPrinter ? '50mm 30mm' : 'A4'};
            margin: ${useLabelPrinter ? '2mm' : '10mm'};
          }
          body {
            font-family: Arial, sans-serif;
            margin: 0;
            padding: 0;
          }
          .label-container {
            display: ${useLabelPrinter ? 'block' : 'flex'};
            flex-wrap: wrap;
            gap: 10px;
            padding: ${useLabelPrinter ? '0' : '10px'};
          }
          .label {
            width: ${useLabelPrinter ? '46mm' : '60mm'};
            height: ${useLabelPrinter ? '26mm' : '35mm'};
            border: ${useLabelPrinter ? 'none' : '1px dashed #ccc'};
            padding: 3mm;
            box-sizing: border-box;
            display: flex;
            flex-direction: column;
            justify-content: center;
            align-items: center;
            page-break-after: ${useLabelPrinter ? 'always' : 'avoid'};
            break-inside: avoid;
          }
          .product-name {
            font-size: ${useLabelPrinter ? '8pt' : '10pt'};
            font-weight: bold;
            text-align: center;
            margin-bottom: 2mm;
            max-width: 100%;
            overflow: hidden;
            text-overflow: ellipsis;
            white-space: nowrap;
          }
          .barcode {
            font-family: 'Libre Barcode 39', 'Free 3 of 9', monospace;
            font-size: ${useLabelPrinter ? '24pt' : '32pt'};
            letter-spacing: 2px;
          }
          .barcode-text {
            font-size: ${useLabelPrinter ? '7pt' : '9pt'};
            margin-top: 1mm;
          }
          .price {
            font-size: ${useLabelPrinter ? '10pt' : '12pt'};
            font-weight: bold;
            margin-top: 1mm;
          }
        </style>
        <link href="https://fonts.googleapis.com/css2?family=Libre+Barcode+39&display=swap" rel="stylesheet">
      </head>
      <body>
        <div class="label-container">
          ${Array(quantity).fill(`
            <div class="label">
              <div class="product-name">${productData.name}</div>
              <div class="barcode">*${productData.barcode}*</div>
              <div class="barcode-text">${productData.barcode}</div>
              <div class="price">Rs. Rs. {parseFloat(productData.price || 0).toFixed(2)}</div>
            </div>
          `).join('')}
        </div>
        <script>
          window.onload = function() {
            setTimeout(function() {
              window.print();
              window.close();
            }, 500);
          }
        </script>
      </body>
      </html>
    `;

    const printWindow = window.open('', '_blank', 'width=400,height=300');
    if (printWindow) {
      printWindow.document.write(labelHTML);
      printWindow.document.close();
    } else {
      toast.error('Please allow popups to print labels');
    }
  };

  const handleCloseModal = () => {
    setShowProductModal(false);
    setEditingProduct(null);
  };

  return (
    <div className="p-6">
      {/* View Only Banner for Salesmen */}
      {isSalesman && (
        <div className="mb-4 p-3 bg-yellow-50 border border-yellow-200 rounded-lg flex items-center gap-2">
          <EyeIcon className="w-5 h-5 text-yellow-600" />
          <span className="text-yellow-800 text-sm font-medium">View Only Mode - You can view products but cannot add, edit, or delete them.</span>
        </div>
      )}

      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Products</h1>
          <p className="text-gray-500">{isSalesman ? 'View product catalog and details' : 'Manage your product catalog and variants'}</p>
        </div>
        <div className="flex items-center gap-3">
          <button
            onClick={() => refetch()}
            className="p-2 bg-white border rounded-lg hover:bg-gray-50 transition-colors"
            title="Refresh"
          >
            <ArrowPathIcon className="w-5 h-5 text-gray-600" />
          </button>
          {!isSalesman && (
            <button
              onClick={() => setShowProductModal(true)}
              className="btn-primary flex items-center gap-2"
            >
              <PlusIcon className="w-5 h-5" />
              Add Product
            </button>
          )}
        </div>
      </div>

      {/* Filters */}
      <div className="bg-white rounded-xl p-4 mb-6 flex gap-4">
        {/* Search */}
        <div className="relative flex-1">
          <MagnifyingGlassIcon className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-gray-400" />
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Search products by name, SKU, or barcode..."
            className="w-full pl-10 pr-4 py-2 border rounded-lg"
          />
        </div>

        {/* Category Filter */}
        <div className="relative">
          <select
            value={selectedCategory}
            onChange={(e) => setSelectedCategory(e.target.value)}
            className="appearance-none pl-10 pr-10 py-2 border rounded-lg bg-white"
          >
            <option value="">All Categories</option>
            {categories?.map((cat) => (
              <option key={cat.id} value={cat.id}>
                {cat.name}
              </option>
            ))}
          </select>
          <FunnelIcon className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-gray-400" />
          <ChevronDownIcon className="absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
        </div>
      </div>

      {/* Products Table */}
      <div className="bg-white rounded-xl shadow overflow-hidden">
        <table className="w-full">
          <thead className="bg-gray-50 border-b">
            <tr>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                Product
              </th>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                SKU
              </th>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                Category
              </th>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                Price
              </th>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                Stock
              </th>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                Status
              </th>
              <th className="px-6 py-3 text-right text-xs font-medium text-gray-500 uppercase tracking-wider">
                Actions
              </th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-200">
            {isLoading ? (
              [...Array(5)].map((_, i) => (
                <tr key={i} className="animate-pulse">
                  <td className="px-6 py-4">
                    <div className="flex items-center gap-3">
                      <div className="w-12 h-12 bg-gray-200 rounded-lg" />
                      <div className="h-4 bg-gray-200 rounded w-32" />
                    </div>
                  </td>
                  <td className="px-6 py-4"><div className="h-4 bg-gray-200 rounded w-24" /></td>
                  <td className="px-6 py-4"><div className="h-4 bg-gray-200 rounded w-20" /></td>
                  <td className="px-6 py-4"><div className="h-4 bg-gray-200 rounded w-16" /></td>
                  <td className="px-6 py-4"><div className="h-4 bg-gray-200 rounded w-12" /></td>
                  <td className="px-6 py-4"><div className="h-4 bg-gray-200 rounded w-16" /></td>
                  <td className="px-6 py-4"><div className="h-4 bg-gray-200 rounded w-20 ml-auto" /></td>
                </tr>
              ))
            ) : products?.length > 0 ? (
              products.map((product) => (
                <React.Fragment key={product.id}>
                  {/* Parent Product Row */}
                  <tr className="hover:bg-gray-50">
                    <td className="px-6 py-4">
                      <div className="flex items-center gap-3">
                        {product.variants?.length > 0 && (
                          <button
                            onClick={() => toggleExpand(product.id)}
                            className="p-1 hover:bg-gray-100 rounded"
                          >
                            {expandedProducts.has(product.id) ? (
                              <ChevronDownIcon className="w-4 h-4 text-gray-500" />
                            ) : (
                              <ChevronRightIcon className="w-4 h-4 text-gray-500" />
                            )}
                          </button>
                        )}
                        <div className="w-12 h-12 bg-gray-100 rounded-lg flex items-center justify-center overflow-hidden">
                          {product.imageUrl ? (
                            <img src={product.imageUrl} alt="" className="w-full h-full object-cover" />
                          ) : (
                            <QrCodeIcon className="w-6 h-6 text-gray-300" />
                          )}
                        </div>
                        <div>
                          <p className="font-medium text-gray-900">{product.name}</p>
                          {product.variants?.length > 0 && (
                            <p className="text-sm text-gray-500">
                              {product.variants.length} variants
                            </p>
                          )}
                        </div>
                      </div>
                    </td>
                    <td className="px-6 py-4 text-sm text-gray-500">{product.code}</td>
                    <td className="px-6 py-4">
                      <span className="px-2 py-1 bg-gray-100 text-gray-700 text-sm rounded-full">
                        {product.category?.name || 'Uncategorized'}
                      </span>
                    </td>
                    <td className="px-6 py-4 font-medium">Rs. {parseFloat(product.basePrice || 0).toFixed(2)}</td>
                    <td className="px-6 py-4">
                      <span className={`font-medium ${product.totalStock > 10 ? 'text-green-600' :
                        product.totalStock > 0 ? 'text-yellow-600' : 'text-red-600'
                        }`}>
                        {product.totalStock || 0}
                      </span>
                    </td>
                    <td className="px-6 py-4">
                      <span className={`px-2 py-1 text-xs font-medium rounded-full ${product.isActive
                        ? 'bg-green-100 text-green-700'
                        : 'bg-gray-100 text-gray-600'
                        }`}>
                        {product.isActive ? 'Active' : 'Inactive'}
                      </span>
                    </td>
                    <td className="px-6 py-4">
                      <div className="flex items-center justify-end gap-2">
                        <button
                          onClick={() => handlePrintLabel(product)}
                          className="p-2 text-gray-400 hover:text-blue-600 hover:bg-gray-100 rounded-lg"
                          title="Print Labels"
                        >
                          <PrinterIcon className="w-4 h-4" />
                        </button>
                        {!isSalesman && (
                          <>
                            <button
                              onClick={() => handleEdit(product)}
                              className="p-2 text-gray-400 hover:text-primary-600 hover:bg-gray-100 rounded-lg"
                              title="Edit"
                            >
                              <PencilIcon className="w-4 h-4" />
                            </button>
                            <button
                              onClick={() => handleDelete(product)}
                              className="p-2 text-gray-400 hover:text-red-600 hover:bg-gray-100 rounded-lg"
                              title="Delete"
                            >
                              <TrashIcon className="w-4 h-4" />
                            </button>
                          </>
                        )}
                      </div>
                    </td>
                  </tr>

                  {/* Variant Rows */}
                  {expandedProducts.has(product.id) && Array.isArray(product.variants) && product.variants.map((variant) => (
                    <tr key={variant.id} className="bg-gray-50/50">
                      <td className="px-6 py-3 pl-16">
                        <div className="flex items-center gap-3">
                          <div className="w-10 h-10 bg-gray-100 rounded-lg flex items-center justify-center">
                            <TagIcon className="w-5 h-5 text-gray-400" />
                          </div>
                          <div>
                            <p className="text-sm font-medium text-gray-700">
                              {variant.name}
                            </p>
                            <div className="flex gap-2 mt-1">
                              {variant.attributes?.map((attr, i) => (
                                <span key={i} className="text-xs px-2 py-0.5 bg-primary-50 text-primary-700 rounded">
                                  {attr.name}: {attr.value}
                                </span>
                              ))}
                            </div>
                          </div>
                        </div>
                      </td>
                      <td className="px-6 py-3 text-sm text-gray-500">{variant.sku}</td>
                      <td className="px-6 py-3"></td>
                      <td className="px-6 py-3 font-medium text-sm">
                        Rs. {parseFloat(variant.price || product.basePrice || 0).toFixed(2)}
                      </td>
                      <td className="px-6 py-3">
                        <span className={`text-sm font-medium ${variant.stock > 10 ? 'text-green-600' :
                          variant.stock > 0 ? 'text-yellow-600' : 'text-red-600'
                          }`}>
                          {variant.stock || 0}
                        </span>
                      </td>
                      <td className="px-6 py-3">
                        <span className={`px-2 py-1 text-xs font-medium rounded-full ${variant.isActive
                          ? 'bg-green-100 text-green-700'
                          : 'bg-gray-100 text-gray-600'
                          }`}>
                          {variant.isActive ? 'Active' : 'Inactive'}
                        </span>
                      </td>
                      <td className="px-6 py-3">
                        <div className="flex items-center justify-end gap-2">
                          <button className="p-1.5 text-gray-400 hover:text-primary-600 rounded">
                            <PencilIcon className="w-3.5 h-3.5" />
                          </button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </React.Fragment>
              ))
            ) : (
              <tr>
                <td colSpan={7} className="px-6 py-12 text-center text-gray-500">
                  <QrCodeIcon className="w-12 h-12 mx-auto mb-4 text-gray-300" />
                  <p className="text-lg font-medium">No products found</p>
                  <p className="text-sm">Add your first product to get started</p>
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      {/* Product Modal */}
      {showProductModal && (
        <ProductModal
          product={editingProduct}
          categories={categories}
          onClose={handleCloseModal}
          onSave={() => {
            refetch();
            handleCloseModal();
          }}
        />
      )}

      {/* Print Label Modal - Simple with Color */}
      {printLabelProduct && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-[70]">
          <div className="bg-white rounded-2xl w-full max-w-md p-6">
            <div className="flex justify-between items-start mb-6">
              <div className="text-center w-full">
                <div className="w-16 h-16 bg-blue-100 rounded-full flex items-center justify-center mx-auto mb-4">
                  <PrinterIcon className="w-8 h-8 text-blue-600" />
                </div>
                <h3 className="text-xl font-semibold text-gray-900">Print Labels</h3>
                <p className="text-gray-500 mt-1">{printLabelProduct.name}</p>
                {printLabelProduct.color && (
                  <p className="text-sm text-blue-600 mt-1">Color: {printLabelProduct.color}</p>
                )}
              </div>
              <button
                onClick={() => setPrintLabelProduct(null)}
                className="absolute top-4 right-4 text-gray-400 hover:text-gray-600"
              >
                <XMarkIcon className="w-6 h-6" />
              </button>
            </div>

            {loadingVariants ? (
              <div className="flex justify-center py-8">
                <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600"></div>
              </div>
            ) : (
              <div className="mb-6">
                {/* Product Info */}
                <div className="bg-gray-50 rounded-lg p-4 mb-4">
                  <div className="text-center">
                    <p className="text-sm text-gray-500">Barcode</p>
                    <p className="text-lg font-mono font-medium">{printLabelProduct.barcode || printLabelProduct.code}</p>
                    <p className="text-lg font-semibold text-green-600 mt-2">
                      Rs. {parseFloat(printLabelProduct.basePrice || 0).toFixed(2)}
                    </p>
                  </div>
                </div>

                <label className="label">Number of Labels</label>
                <div className="flex items-center justify-center gap-4">
                  <button
                    onClick={() => setPrintQuantity(Math.max(1, printQuantity - 1))}
                    className="w-10 h-10 rounded-full bg-gray-100 flex items-center justify-center hover:bg-gray-200"
                  >
                    <MinusIcon className="w-5 h-5" />
                  </button>
                  <input
                    type="number"
                    value={printQuantity}
                    onChange={(e) => setPrintQuantity(Math.max(1, parseInt(e.target.value) || 1))}
                    min="1"
                    max="100"
                    className="input text-center text-lg w-24"
                  />
                  <button
                    onClick={() => setPrintQuantity(printQuantity + 1)}
                    className="w-10 h-10 rounded-full bg-gray-100 flex items-center justify-center hover:bg-gray-200"
                  >
                    <PlusIcon className="w-5 h-5" />
                  </button>
                </div>
                <div className="mt-4">
                  <button
                    onClick={handlePrintSubmit}
                    className="w-full btn-primary flex items-center justify-center gap-2"
                  >
                    <PrinterIcon className="w-5 h-5" />
                    Print {printQuantity} Label{printQuantity > 1 ? 's' : ''}
                  </button>
                </div>
              </div>
            )}

            <div className="pt-4 border-t">
              <button
                onClick={() => setPrintLabelProduct(null)}
                className="w-full text-gray-500 hover:text-gray-700 py-2"
              >
                Close
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Delete Confirmation Modal */}
      {productToDelete && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-[80]">
          <div className="bg-white rounded-2xl w-full max-w-sm p-6">
            <div className="flex items-center justify-center w-12 h-12 rounded-full bg-red-100 mx-auto mb-4">
              <ExclamationTriangleIcon className="w-6 h-6 text-red-600" />
            </div>
            <h3 className="text-lg font-semibold text-center text-gray-900 mb-2">Delete Product?</h3>
            <p className="text-sm text-center text-gray-500 mb-6">
              Are you sure you want to delete "{productToDelete.name}"? This action cannot be undone.
            </p>
            <div className="flex gap-3">
              <button
                onClick={() => setProductToDelete(null)}
                className="flex-1 btn btn-secondary"
              >
                Cancel
              </button>
              <button
                onClick={confirmDelete}
                className="flex-1 bg-red-600 text-white px-4 py-2 rounded-lg hover:bg-red-700 transition-colors font-medium"
              >
                Delete
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

// Product Modal Component
function ProductModal({ product, categories, onClose, onSave }) {
  const queryClient = useQueryClient();

  // Fetch locations for stock assignment
  const { data: locationsData } = useQuery({
    queryKey: ['product-locations'],
    queryFn: async () => {
      const res = await api.get('/inventory/locations');
      console.log('Locations response:', res.data);
      return res.data;
    }
  });
  const locations = locationsData?.locations || [];

  // Fetch SKU sizes for dropdown
  const { data: skuSizes = [] } = useQuery({
    queryKey: ['sku-sizes-dropdown'],
    queryFn: () => api.get('/products/sku-sizes/all').then(res => res.data),
    staleTime: 0
  });

  // Fetch SKU colors for dropdown
  const { data: skuColors = [] } = useQuery({
    queryKey: ['sku-colors-dropdown'],
    queryFn: () => api.get('/products/sku-colors/all').then(res => res.data),
    staleTime: 0
  });

  const [formData, setFormData] = useState({
    name: product?.name || '',
    sku: product?.code || '',
    barcode: product?.barcode || '',
    category_id: product?.category?.id || product?.categoryId || '',
    description: product?.description || '',
    price: product?.basePrice || '',
    cost_price: product?.costPrice || '',
    initial_stock: product?.totalStock ?? product?.stock ?? 0,
    location_id: '', // Will default to first location
    is_active: product?.isActive ?? true,
    size_id: '', // Size from sku_sizes table
    color_id: '', // Color from sku_colors table
    color: product?.color || '', // Color name for label printing
    size: product?.size || '' // Size name for label printing
  });
  const [generatingSku, setGeneratingSku] = useState(false);
  const [loading, setLoading] = useState(false);
  const [showLabelModal, setShowLabelModal] = useState(false);
  const [createdProduct, setCreatedProduct] = useState(null);
  const [labelQuantity, setLabelQuantity] = useState(1);

  // Fetch full product details when editing to get color and size
  useEffect(() => {
    const fetchProductDetails = async () => {
      if (product?.id) {
        try {
          const response = await api.get(`/products/${product.id}`);
          const fullProduct = response.data;
          const variant = fullProduct.variants?.[0];

          // Extract color and size from variant_name (stored as 'Color' or 'Color / Size')
          if (variant?.variant_name && variant.variant_name !== 'Default') {
            const parts = variant.variant_name.split('/').map(p => p.trim());
            const color = parts[0] || '';
            const size = parts[1] || '';

            setFormData(prev => ({
              ...prev,
              color: color,
              size: size
            }));
          }
        } catch (error) {
          console.error('Error fetching product details:', error);
        }
      }
    };

    fetchProductDetails();
  }, [product?.id]);

  // Auto-generate barcode when SKU changes (for new products only)
  useEffect(() => {
    if (!product && formData.sku && !formData.barcode) {
      // Generate barcode from SKU - use numeric format for standard barcode scanners
      const barcodeValue = generateBarcodeFromSKU(formData.sku);
      setFormData(prev => ({ ...prev, barcode: barcodeValue }));
    }
  }, [formData.sku, product]);

  const generateBarcodeFromSKU = (sku) => {
    // Generate a numeric barcode: timestamp + hash of SKU
    // This creates a unique 13-digit EAN-like barcode
    const timestamp = Date.now().toString().slice(-7);
    let hash = 0;
    for (let i = 0; i < sku.length; i++) {
      hash = ((hash << 5) - hash) + sku.charCodeAt(i);
      hash = hash & hash;
    }
    const hashStr = Math.abs(hash).toString().padStart(6, '0').slice(0, 6);
    return timestamp + hashStr;
  };

  const printLabels = async (productData, quantity = 1, useLabelPrinter = true) => {
    const barcode = productData.barcode || productData.sku;
    const name = productData.name;
    const price = productData.price;

    // Create label HTML
    const labelHTML = `
      <!DOCTYPE html>
      <html>
      <head>
        <title>Product Labels</title>
        <style>
          @page {
            size: ${useLabelPrinter ? '50mm 30mm' : 'A4'};
            margin: ${useLabelPrinter ? '2mm' : '10mm'};
          }
          body {
            font-family: Arial, sans-serif;
            margin: 0;
            padding: 0;
          }
          .label-container {
            display: ${useLabelPrinter ? 'block' : 'flex'};
            flex-wrap: wrap;
            gap: 10px;
            padding: ${useLabelPrinter ? '0' : '10px'};
          }
          .label {
            width: ${useLabelPrinter ? '46mm' : '60mm'};
            height: ${useLabelPrinter ? '26mm' : '35mm'};
            border: ${useLabelPrinter ? 'none' : '1px dashed #ccc'};
            padding: 3mm;
            box-sizing: border-box;
            display: flex;
            flex-direction: column;
            justify-content: center;
            align-items: center;
            page-break-after: ${useLabelPrinter ? 'always' : 'avoid'};
            break-inside: avoid;
          }
          .product-name {
            font-size: ${useLabelPrinter ? '8pt' : '10pt'};
            font-weight: bold;
            text-align: center;
            margin-bottom: 2mm;
            max-width: 100%;
            overflow: hidden;
            text-overflow: ellipsis;
            white-space: nowrap;
          }
          .barcode {
            font-family: 'Libre Barcode 39', 'Free 3 of 9', monospace;
            font-size: ${useLabelPrinter ? '24pt' : '32pt'};
            letter-spacing: 2px;
          }
          .barcode-text {
            font-size: ${useLabelPrinter ? '7pt' : '9pt'};
            margin-top: 1mm;
          }
          .price {
            font-size: ${useLabelPrinter ? '10pt' : '12pt'};
            font-weight: bold;
            margin-top: 1mm;
          }
          @media print {
            .no-print { display: none; }
          }
        </style>
        <link href="https://fonts.googleapis.com/css2?family=Libre+Barcode+39&display=swap" rel="stylesheet">
      </head>
      <body>
        <div class="label-container">
          ${Array(quantity).fill(`
            <div class="label">
              <div class="product-name">${name}</div>
              <div class="barcode">*${barcode}*</div>
              <div class="barcode-text">${barcode}</div>
              <div class="price">Rs. Rs. {parseFloat(price).toFixed(2)}</div>
            </div>
          `).join('')}
        </div>
        <script>
          window.onload = function() {
            setTimeout(function() {
              window.print();
              window.close();
            }, 500);
          }
        </script>
      </body>
      </html>
    `;

    const printWindow = window.open('', '_blank', 'width=400,height=300');
    if (printWindow) {
      printWindow.document.write(labelHTML);
      printWindow.document.close();
    } else {
      toast.error('Please allow popups to print labels');
    }
  };

  const handleSubmit = async (e) => {
    e.preventDefault();

    // Validate barcode is provided
    if (!formData.barcode || formData.barcode.trim() === '') {
      toast.error('Barcode is required');
      return;
    }

    setLoading(true);

    try {
      // Map client field names to server expected field names
      const payload = {
        name: formData.name,
        code: formData.sku || `PRD-${Date.now()}`, // Server expects 'code', use SKU or generate one
        description: formData.description,
        basePrice: parseFloat(formData.price) || 0,
        costPrice: parseFloat(formData.cost_price) || 0,
        stock: parseInt(formData.initial_stock) || 0,
        locationId: formData.location_id ? parseInt(formData.location_id) : null, // Selected store for initial stock
        isActive: formData.is_active,
        barcode: formData.barcode,
        color: formData.color || null, // Color field
        size: formData.size || null // Size field
      };

      // Only include categoryId if it has a valid value (not null/empty)
      if (formData.category_id) {
        payload.categoryId = parseInt(formData.category_id);
      }

      let savedProduct;
      if (product) {
        await api.put(`/products/${product.id}`, payload);
        toast.success('Product updated successfully');
        savedProduct = { ...payload, id: product.id };
      } else {
        // For new products, use initialStock
        payload.initialStock = payload.stock;
        delete payload.stock;
        const response = await api.post('/products', payload);
        toast.success('Product created successfully');
        savedProduct = { ...payload, id: response.data?.productId };

        // Show label printing modal for new products - pass BOTH sku and barcode
        setCreatedProduct({
          name: formData.name,
          sku: formData.sku,  // Product SKU (printed above barcode)
          barcode: formData.barcode || formData.sku, // Barcode number (printed below barcode)
          price: formData.price,
          color: formData.color || null, // Include color for label
          size: formData.size || null // Include size for label
        });
        setShowLabelModal(true);
        setLoading(false);
        return; // Don't close yet, wait for label decision
      }

      // Force refresh the products list
      await queryClient.invalidateQueries({ queryKey: ['products'] });
      onSave();
    } catch (error) {
      toast.error(error.response?.data?.message || 'Failed to save product');
    } finally {
      setLoading(false);
    }
  };

  const handleLabelPrint = async () => {
    if (createdProduct) {
      try {
        toast.loading('Printing labels...', { id: 'new-product-label' });

        const response = await api.post('/hardware/label/print', {
          sku: createdProduct.sku,           // Product SKU (printed above barcode)
          barcode: createdProduct.barcode,    // Barcode number (used for scanning)
          productName: createdProduct.name,
          price: createdProduct.price || 0,
          quantity: labelQuantity,
          color: createdProduct.color || null, // Include color for label
          size: createdProduct.size || null // Include size for label
        });

        if (response.data.success) {
          toast.success(`Printed ${labelQuantity} label(s)`, { id: 'new-product-label' });
        } else {
          throw new Error(response.data.message || 'Print failed');
        }
      } catch (error) {
        console.error('Label print error:', error);
        toast.error(`Print failed: ${error.response?.data?.message || error.message}`, { id: 'new-product-label' });
      }
    }
    setShowLabelModal(false);
    await queryClient.invalidateQueries({ queryKey: ['products'] });
    onSave();
  };

  const handleSkipLabels = async () => {
    setShowLabelModal(false);
    await queryClient.invalidateQueries({ queryKey: ['products'] });
    onSave();
  };

  const generateSKU = async () => {
    if (!formData.category_id) {
      toast.error('Please select a category first');
      return;
    }

    setGeneratingSku(true);
    try {
      const response = await api.post('/products/generate-sku', {
        categoryId: parseInt(formData.category_id),
        sizeId: formData.size_id ? parseInt(formData.size_id) : null,
        colorId: formData.color_id ? parseInt(formData.color_id) : null
      });

      const newSku = response.data.sku;
      const newBarcode = generateBarcodeFromSKU(newSku);
      setFormData({ ...formData, sku: newSku, barcode: newBarcode });
      toast.success('SKU generated successfully');
    } catch (error) {
      const errorMsg = error.response?.data?.message || 'Failed to generate SKU';
      toast.error(errorMsg);
    } finally {
      setGeneratingSku(false);
    }
  };

  const regenerateBarcode = () => {
    if (formData.sku) {
      const newBarcode = generateBarcodeFromSKU(formData.sku);
      setFormData({ ...formData, barcode: newBarcode });
      toast.success('Barcode regenerated');
    } else {
      toast.error('Enter SKU first to generate barcode');
    }
  };

  const addVariant = () => {
    const newVariantSku = `${formData.sku}-V${variants.length + 1}`;
    setVariants([
      ...variants,
      {
        id: Date.now(),
        variant_name: '',
        sku: newVariantSku,
        barcode: generateBarcodeFromSKU(newVariantSku),
        price: formData.price,
        initial_stock: 0,
        attributes: [{ name: 'Size', value: '' }, { name: 'Color', value: '' }]
      }
    ]);
  };

  const updateVariant = (id, field, value) => {
    setVariants(variants.map(v =>
      v.id === id ? { ...v, [field]: value } : v
    ));
  };

  const updateVariantAttribute = (variantId, attrIndex, field, value) => {
    setVariants(variants.map(v => {
      if (v.id === variantId) {
        const newAttributes = [...v.attributes];
        newAttributes[attrIndex] = { ...newAttributes[attrIndex], [field]: value };
        return { ...v, attributes: newAttributes };
      }
      return v;
    }));
  };

  const removeVariant = (id) => {
    setVariants(variants.filter(v => v.id !== id));
  };

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-2xl w-full max-w-3xl max-h-[90vh] flex flex-col">
        {/* Header */}
        <div className="flex items-center justify-between p-6 border-b">
          <h2 className="text-xl font-semibold">
            {product ? 'Edit Product' : 'Add New Product'}
          </h2>
          <button onClick={onClose}>
            <XMarkIcon className="w-6 h-6 text-gray-400" />
          </button>
        </div>

        {/* Content */}
        <form onSubmit={handleSubmit} className="flex-1 overflow-y-auto p-6">
          <div className="space-y-4">
            {/* Product Name */}
            <div>
              <label className="label">Product Name *</label>
              <input
                type="text"
                value={formData.name}
                onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                placeholder="Enter product name"
                className="input"
                required
              />
            </div>

            {/* SKU & Barcode */}
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="label">SKU *</label>
                <div className="flex gap-2">
                  <input
                    type="text"
                    value={formData.sku}
                    onChange={(e) => setFormData({ ...formData, sku: e.target.value.toUpperCase() })}
                    placeholder="Product SKU"
                    className="input flex-1"
                    required
                  />
                  <button
                    type="button"
                    onClick={generateSKU}
                    className="btn btn-secondary"
                    title="Generate SKU"
                  >
                    <DocumentDuplicateIcon className="w-5 h-5" />
                  </button>
                </div>
              </div>
              <div>
                <label className="label">Barcode *</label>
                <div className="flex gap-2">
                  <input
                    type="text"
                    value={formData.barcode}
                    onChange={(e) => setFormData({ ...formData, barcode: e.target.value })}
                    placeholder="Enter unique barcode"
                    className="input flex-1"
                    required
                  />
                  <button
                    type="button"
                    onClick={regenerateBarcode}
                    className="btn btn-secondary"
                    title="Regenerate Barcode"
                  >
                    <QrCodeIcon className="w-5 h-5" />
                  </button>
                </div>
                {formData.barcode && (
                  <p className="text-xs text-gray-500 mt-1">
                    Barcode: {formData.barcode}
                  </p>
                )}
              </div>
            </div>

            {/* Category */}
            <div>
              <label className="label">Category</label>
              <select
                value={formData.category_id}
                onChange={(e) => setFormData({ ...formData, category_id: e.target.value })}
                className="input"
              >
                <option value="">Select Category</option>
                {categories?.map((cat) => (
                  <option key={cat.id} value={cat.id}>
                    {cat.name}
                  </option>
                ))}
              </select>
            </div>

            {/* Description */}
            <div>
              <label className="label">Description</label>
              <textarea
                value={formData.description}
                onChange={(e) => setFormData({ ...formData, description: e.target.value })}
                placeholder="Product description"
                rows={3}
                className="input resize-none"
              />
            </div>

            {/* Prices */}
            <div className="grid grid-cols-3 gap-4">
              <div>
                <label className="label">Selling Price *</label>
                <div className="relative">
                  <span className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-500">Rs.</span>
                  <input
                    type="number"
                    value={formData.price}
                    onChange={(e) => setFormData({ ...formData, price: e.target.value })}
                    placeholder="0.00"
                    step="0.01"
                    min="0"
                    className="input pl-8"
                    required
                  />
                </div>
              </div>
              <div>
                <label className="label">Cost Price</label>
                <div className="relative">
                  <span className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-500">Rs.</span>
                  <input
                    type="number"
                    value={formData.cost_price}
                    onChange={(e) => setFormData({ ...formData, cost_price: e.target.value })}
                    placeholder="0.00"
                    step="0.01"
                    min="0"
                    className="input pl-8"
                  />
                </div>
              </div>
              <div>
                <label className="label">Initial Stock</label>
                <input
                  type="number"
                  value={formData.initial_stock}
                  onChange={(e) => setFormData({ ...formData, initial_stock: e.target.value })}
                  placeholder="0"
                  min="0"
                  className="input"
                />
              </div>
              <div>
                <label className="label">Stock Location *</label>
                <select
                  value={formData.location_id}
                  onChange={(e) => setFormData({ ...formData, location_id: e.target.value })}
                  className="input"
                  required={!product && parseInt(formData.initial_stock) > 0}
                >
                  <option value="">Select store</option>
                  {locations.map((loc) => (
                    <option key={loc.LocationID || loc.location_id} value={loc.LocationID || loc.location_id}>
                      {loc.LocationName || loc.location_name}
                    </option>
                  ))}
                </select>
                <p className="text-xs text-gray-500 mt-1">Which store to add initial stock to</p>
              </div>
            </div>

            {/* Color and Size Dropdowns */}
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="label">Size</label>
                <select
                  value={formData.size_id}
                  onChange={(e) => {
                    const selectedSize = skuSizes.find(s => s.size_id === parseInt(e.target.value));
                    setFormData({
                      ...formData,
                      size_id: e.target.value,
                      size: selectedSize?.size_name || ''
                    });
                  }}
                  className="input"
                >
                  <option value="">Select Size</option>
                  {skuSizes.map((size) => (
                    <option key={size.size_id} value={size.size_id}>
                      {size.size_name} ({size.size_code})
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <label className="label">Color</label>
                <select
                  value={formData.color_id}
                  onChange={(e) => {
                    const selectedColor = skuColors.find(c => c.color_id === parseInt(e.target.value));
                    setFormData({
                      ...formData,
                      color_id: e.target.value,
                      color: selectedColor?.color_name || ''
                    });
                  }}
                  className="input"
                >
                  <option value="">Select Color</option>
                  {skuColors.map((color) => (
                    <option key={color.color_id} value={color.color_id}>
                      {color.color_name} ({color.color_code})
                    </option>
                  ))}
                </select>
              </div>
            </div>
            <p className="text-xs text-gray-500 -mt-2">Size and Color are used for SKU generation and printed on the product label</p>

            {/* Active Status */}
            <div className="flex items-center justify-between p-4 bg-gray-50 rounded-lg">
              <div>
                <p className="font-medium">Active</p>
                <p className="text-sm text-gray-500">Product is available for sale</p>
              </div>
              <button
                type="button"
                onClick={() => setFormData({ ...formData, is_active: !formData.is_active })}
                className={`relative w-12 h-6 rounded-full transition-colors ${formData.is_active ? 'bg-primary-600' : 'bg-gray-300'
                  }`}
              >
                <span
                  className={`absolute top-1 w-4 h-4 bg-white rounded-full transition-transform ${formData.is_active ? 'left-7' : 'left-1'
                    }`}
                />
              </button>
            </div>
          </div>
        </form>

        {/* Footer */}
        <div className="flex items-center justify-end gap-3 p-6 border-t bg-gray-50">
          <button type="button" onClick={onClose} className="btn btn-secondary">
            Cancel
          </button>
          <button
            onClick={handleSubmit}
            disabled={loading}
            className="btn-primary"
          >
            {loading ? 'Saving...' : (product ? 'Update Product' : 'Create Product')}
          </button>
        </div>


        {/* Label Printing Modal (for new products) */}
        {showLabelModal && (
          <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-[60]">
            <div className="bg-white rounded-2xl w-full max-w-md p-6">
              <div className="text-center mb-6">
                <div className="w-16 h-16 bg-green-100 rounded-full flex items-center justify-center mx-auto mb-4">
                  <PrinterIcon className="w-8 h-8 text-green-600" />
                </div>
                <h3 className="text-xl font-semibold text-gray-900">Product Created!</h3>
                <p className="text-gray-500 mt-2">Would you like to print labels for this product?</p>
              </div>

              <div className="bg-gray-50 rounded-lg p-4 mb-6">
                <div className="text-center">
                  <p className="font-medium text-gray-900">{createdProduct?.name}</p>
                  <p className="text-2xl font-mono mt-2 tracking-wider">{createdProduct?.barcode}</p>
                  <p className="text-lg font-semibold text-primary-600 mt-1">
                    Rs. {parseFloat(createdProduct?.price || 0).toFixed(2)}
                  </p>
                </div>
              </div>

              <div className="mb-6">
                <label className="label">Number of Labels</label>
                <input
                  type="number"
                  value={labelQuantity}
                  onChange={(e) => setLabelQuantity(Math.max(1, parseInt(e.target.value) || 1))}
                  min="1"
                  max="100"
                  className="input text-center text-lg"
                />
              </div>

              <div className="space-y-3">
                <button
                  onClick={handleLabelPrint}
                  className="w-full btn-primary flex items-center justify-center gap-2"
                >
                  <PrinterIcon className="w-5 h-5" />
                  Print {labelQuantity} Label{labelQuantity > 1 ? 's' : ''}
                </button>
                <button
                  onClick={handleSkipLabels}
                  className="w-full text-gray-500 hover:text-gray-700 py-2"
                >
                  Skip - Don't Print Labels
                </button>
              </div>
            </div>
          </div>
        )}

      </div>
    </div>
  );
}
