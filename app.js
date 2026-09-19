import express from 'express';
import mysql from 'mysql2/promise';
import cors from 'cors';

const app = express();
app.use(cors()); 
app.use(express.json());

// Conexión mediante Pool de conexiones
const db = mysql.createPool({
  host: process.env.DB_HOST,
  user: process.env.DB_USER,
  password: process.env.DB_PASSWORD,
  database: process.env.DB_NAME,
  port: process.env.DB_PORT || 3306,
  ssl: {
    rejectUnauthorized: false
  },
  waitForConnections: true,
  connectionLimit: 10,
  queueLimit: 0
});

// Rutas API Clientes
app.get('/api/clientes', async (req, res) => {
  try {
    const [rows] = await db.query('SELECT * FROM clientes');
    res.json(rows);
  } catch (error) {
    res.status(500).json({ error: 'Error al obtener los clientes' });
  }
});

app.post('/api/clientes', async (req, res) => {
  const { nomCliente, contacto, departamento, ciudad } = req.body;
  try {
    const [result] = await db.query(
      'INSERT INTO clientes (nomCliente, contacto, departamento, ciudad) VALUES (?, ?, ?, ?)',
      [nomCliente, contacto, departamento, ciudad]
    );
    res.json({ id_cliente: result.insertId, nomCliente, contacto, departamento, ciudad });
  } catch (error) {
    res.status(500).json({ error: 'Error al crear el cliente' });
  }
});

app.put('/api/clientes/:id', async (req, res) => {
  const { id } = req.params;
  const { nomCliente, contacto, departamento, ciudad } = req.body;
  try {
    await db.query(
      'UPDATE clientes SET nomCliente = ?, contacto = ?, departamento = ?, ciudad = ? WHERE id_cliente = ?',
      [nomCliente, contacto, departamento, ciudad, id]
    );
    res.json({ message: 'Cliente actualizado correctamente' });
  } catch (error) {
    res.status(500).json({ error: 'Error al actualizar el cliente' });
  }
});

app.delete('/api/clientes/:id', async (req, res) => {
  const { id } = req.params;
  try {
    await db.query('DELETE FROM clientes WHERE id_cliente = ?', [id]);
    res.json({ message: 'Cliente eliminado correctamente' });
  } catch (error) {
    res.status(500).json({ error: 'No se puede eliminar el cliente si tiene ventas asociadas' });
  }
});

// Rutas API Productos
app.get('/api/productos', async (req, res) => {
  try {
    const [rows] = await db.query('SELECT * FROM productos');
    res.json(rows);
  } catch (error) {
    res.status(500).json({ error: 'Error al obtener los productos' });
  }
});

app.post('/api/productos', async (req, res) => {
  const { nomProducto, cantidad, precio } = req.body;
  try {
    const [result] = await db.query(
      'INSERT INTO productos (nomProducto, cantidad, precio) VALUES (?, ?, ?)',
      [nomProducto, cantidad, precio]
    );
    res.json({ id_producto: result.insertId, nomProducto, cantidad, precio });
  } catch (error) {
    res.status(500).json({ error: 'Error al crear el producto' });
  }
});

app.put('/api/productos/:id', async (req, res) => {
  const { id } = req.params;
  const { nomProducto, cantidad, precio } = req.body;
  try {
    await db.query(
      'UPDATE productos SET nomProducto = ?, cantidad = ?, precio = ? WHERE id_producto = ?',
      [nomProducto, cantidad, precio, id]
    );
    res.json({ message: 'Producto actualizado correctamente' });
  } catch (error) {
    res.status(500).json({ error: 'Error al actualizar el producto' });
  }
});

app.delete('/api/productos/:id', async (req, res) => {
  const { id } = req.params;
  try {
    await db.query('DELETE FROM productos WHERE id_producto = ?', [id]);
    res.json({ message: 'Producto eliminado correctamente' });
  } catch (error) {
    res.status(500).json({ error: 'No se puede eliminar el producto si esta en una venta' });
  }
});

// Rutas API Ventas
app.get('/api/ventas', async (req, res) => {
  try {
    const [rows] = await db.query(`
      SELECT v.id_venta, v.id_cliente, c.nomCliente, v.fecha_venta, v.total, v.estado
      FROM ventas v
      JOIN clientes c ON v.id_cliente = c.id_cliente
      ORDER BY v.id_venta DESC
    `);
    res.json(rows);
  } catch (error) {
    res.status(500).json({ error: 'Error al obtener las ventas' });
  }
});

app.get('/api/ventas/:id/detalles', async (req, res) => {
  const { id } = req.params;
  try {
    const [rows] = await db.query(`
      SELECT d.id_detalle, d.id_producto, p.nomProducto, d.cantidad, d.precio_unitario, d.subtotal
      FROM detalle_venta d
      JOIN productos p ON d.id_producto = p.id_producto
      WHERE d.id_venta = ?
    `, [id]);
    res.json(rows);
  } catch (error) {
    res.status(500).json({ error: 'Error al obtener los detalles de la venta' });
  }
});

app.post('/api/ventas', async (req, res) => {
  const { id_cliente, fecha_venta, total, estado, detalles } = req.body;

  try {
    await db.beginTransaction();

    const [ventaResult] = await db.query(
      'INSERT INTO ventas (id_cliente, fecha_venta, total, estado) VALUES (?, ?, ?, ?)',
      [id_cliente, fecha_venta, total, estado || 'Completada']
    );
    const id_venta = ventaResult.insertId;

    for (const item of detalles) {
      await db.query(
        'INSERT INTO detalle_venta (id_venta, id_producto, cantidad, precio_unitario, subtotal) VALUES (?, ?, ?, ?, ?)',
        [id_venta, item.id_producto, item.cantidad, item.precio_unitario, item.subtotal]
      );

      // Descontar del inventario
      await db.query(
        'UPDATE productos SET cantidad = cantidad - ? WHERE id_producto = ?',
        [item.cantidad, item.id_producto]
      );
    }

    await db.commit();
    res.json({ message: 'Venta registrada con éxito', id_venta });
  } catch (error) {
    await db.rollback();
    res.status(500).json({ error: 'Error al registrar la venta' });
  }
});

app.put('/api/ventas/:id/cancelar', async (req, res) => {
  const { id } = req.params;
  try {
    await db.query("UPDATE ventas SET estado = 'Cancelada' WHERE id_venta = ?", [id]);
    res.json({ message: 'Venta cancelada con éxito' });
  } catch (error) {
    res.status(500).json({ error: 'Error al cancelar la venta' });
  }
});

// Inicialización del servidor
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`Servidor corriendo en el puerto ${PORT}`);
});
