import Box from '@mui/material/Box'
import Container from '@mui/material/Container'
import Typography from '@mui/material/Typography'
import Button from '@mui/material/Button'
import AddIcon from '@mui/icons-material/Add'


function App() {
  return (
    <Container maxWidth="lg" sx={{ py: 4 }}>
      <Box
        sx={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          mb: 3,
        }}
      >
        <Box>
          <Typography variant="h3" sx={{ mb: 0.5 }}>
            Task App
          </Typography>
          <Typography variant="body1" color="text.secondary">
            Mini app học pattern QLVB. Bài 2 — MUI + Theme.
          </Typography>
        </Box>
        <Button variant="contained" startIcon={<AddIcon />}>
          Tạo task
        </Button>
      </Box>

      <Box
        sx={{
          p: 3,
          bgcolor: 'background.paper',
          border: '1px solid',
          borderColor: 'divider',
          borderRadius: 1,
        }}
      >
        <Typography variant="h5" sx={{ mb: 1 }}>
          Chưa có task nào
        </Typography>
        <Typography variant="body2" color="text.secondary">
          Nhấn "Tạo task" để bắt đầu. Danh sách task sẽ hiển thị ở bài 7.
        </Typography>
      </Box>
    </Container>
  )
}

export default App